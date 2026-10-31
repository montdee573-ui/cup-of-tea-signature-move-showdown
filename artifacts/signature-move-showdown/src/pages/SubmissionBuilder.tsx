import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, CircleAlert, FileVideo, Film, LockKeyhole,
  ShieldCheck, Upload, WandSparkles, X,
} from "lucide-react";
import { Link } from "wouter";
import { useListMerchCatalog } from "@workspace/api-client-react";
import type { MoveSubmissionReceipt } from "@workspace/api-client-react";
import { participationCategories, sportsCatalog } from "../data/sports-catalog";

type Draft = {
  sport: string;
  customSport: string;
  category: string;
  move: string;
  customMove: string;
  displayName: string;
  handle: string;
  team: string;
  design: "holo" | "court";
  merchProductId: string;
};

const STORAGE_KEY = "signature-move-submission-draft";
const LEGACY_STORAGE_KEY = "cup-of-tea-card-draft";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const emptyDraft: Draft = {
  sport: "Basketball",
  customSport: "",
  category: "Open",
  move: "Crossover",
  customMove: "",
  displayName: "",
  handle: "",
  team: "",
  design: "holo",
  merchProductId: "",
};

function readSavedDraft(): Draft {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return { ...emptyDraft, ...JSON.parse(saved) as Partial<Draft> };
    } catch {
      // Try the next saved draft key; a malformed local draft must not block submission.
    }
  }
  return emptyDraft;
}

function encodeMetadata(metadata: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function acceptedVideoType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp4") return file.type || "video/mp4";
  if (extension === "webm") return file.type || "video/webm";
  if (extension === "mov") return file.type || "video/quicktime";
  return null;
}

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SubmissionBuilder() {
  const [draft, setDraft] = useState<Draft>(readSavedDraft);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sportSearch, setSportSearch] = useState("");
  const [merchSearch, setMerchSearch] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [receipt, setReceipt] = useState<MoveSubmissionReceipt | null>(null);
  const [selectError, setSelectError] = useState("");
  const merchCatalog = useListMerchCatalog();
  const sport = sportsCatalog.find((item) => item.name === draft.sport) ?? sportsCatalog[0];
  const visibleSports = useMemo(() => {
    const matches = sportsCatalog.filter((item) =>
      item.name.toLowerCase().includes(sportSearch.trim().toLowerCase()));
    return matches.some((item) => item.name === draft.sport) ? matches : [sport, ...matches];
  }, [draft.sport, sport, sportSearch]);
  const visibleMerch = useMemo(() => (merchCatalog.data ?? []).filter((item) =>
    item.title.toLowerCase().includes(merchSearch.trim().toLowerCase())),
  [merchCatalog.data, merchSearch]);
  const selectedMerch = (merchCatalog.data ?? []).find(
    (item) => String(item.id) === draft.merchProductId,
  );
  const moveName = draft.move === "Custom move" ? draft.customMove.trim() : draft.move;
  const submissionSport = draft.sport === "Other Sport"
    ? draft.customSport.trim() || "Other Sport"
    : draft.sport;
  const videoUrl = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : null, [videoFile]);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaved(true);
      setUploadError("");
    } catch {
      setUploadError("This browser could not save a local draft. Your current form is still available.");
    }
  };
  const chooseFile = (file: File | null) => {
    setSelectError("");
    setUploadError("");
    if (file && !acceptedVideoType(file)) {
      setVideoFile(null);
      setSelectError("Choose an MP4, WebM, or MOV video.");
      return;
    }
    if (file && file.size > MAX_VIDEO_BYTES) {
      setVideoFile(null);
      setSelectError("This video is over the 100 MB limit. Choose a smaller file.");
      return;
    }
    setVideoFile(file);
  };
  const upload = () => {
    if (!videoFile || !consent || !draft.displayName.trim() || !draft.handle.trim() || !moveName.trim()) return;
    const contentType = acceptedVideoType(videoFile);
    if (!contentType) {
      setUploadError("Choose an MP4, WebM, or MOV video.");
      return;
    }
    setUploadError("");
    setProgress(0);
    const metadata = {
      sport: submissionSport,
      category: draft.category,
      moveName,
      displayName: draft.displayName.trim(),
      handle: draft.handle.trim(),
      ...(draft.team.trim() ? { team: draft.team.trim() } : {}),
      design: draft.design,
      merchProductId: draft.merchProductId ? Number(draft.merchProductId) : null,
      consent: true as const,
      videoFileName: videoFile.name,
    };
    const request = new XMLHttpRequest();
    request.open("POST", "/api/move-submissions");
    request.withCredentials = true;
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("X-Submission-Metadata", encodeMetadata(metadata));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onerror = () => {
      setProgress(null);
      setUploadError("The upload connection was interrupted. Your selected video and form are still here; try again.");
    };
    request.onload = () => {
      let response: Partial<MoveSubmissionReceipt> & { error?: string } = {};
      try { response = JSON.parse(request.responseText); } catch { /* handled below */ }
      if (request.status >= 200 && request.status < 300 && response.id && response.status === "pending" && response.createdAt) {
        setProgress(100);
        setReceipt(response as MoveSubmissionReceipt);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return;
      }
      setProgress(null);
      setUploadError(response.error || `The server could not accept this submission (${request.status || "no response"}). Your form is ready to retry.`);
    };
    request.send(videoFile);
  };
  const resetForNext = () => {
    setReceipt(null);
    setDraft(emptyDraft);
    setVideoFile(null);
    setConsent(false);
    setProgress(null);
    setUploadError("");
    setSelectError("");
    setSaved(false);
  };
  const valid = Boolean(videoFile && consent && draft.displayName.trim() && draft.handle.trim() && moveName.trim());

  if (receipt) {
    return <main className="submission-page">
      <div className="submission-topline"><Link href="/" className="submission-back"><ArrowLeft size={15} /> Back to archive</Link><span>SUBMISSION RECEIVED</span></div>
      <section className="receipt-panel" data-testid="submission-receipt">
        <div className="receipt-symbol"><Check size={27} /></div>
        <span className="launch-label">IN THE REVIEW QUEUE</span>
        <h1>Your move is<br /><em>in good hands.</em></h1>
        <p>Your clip has been received privately. A member of the archive team will review it before it can appear in the public collection.</p>
        <div className="receipt-details">
          <div><span>SUBMISSION ID</span><strong>{receipt.id}</strong></div>
          <div><span>STATUS</span><strong className="pending-text">PENDING REVIEW</strong></div>
          <div><span>RECEIVED</span><strong>{new Date(receipt.createdAt).toLocaleString()}</strong></div>
        </div>
        <div className="receipt-note"><LockKeyhole size={16} /><span>This is a receipt, not a publication notice. Your video is not visible in the archive while it is under review.</span></div>
        <button className="submit-primary" type="button" onClick={resetForNext}>Submit another move <Upload size={15} /></button>
      </section>
    </main>;
  }

  return <main className="submission-page">
    <div className="submission-topline"><Link href="/" className="submission-back"><ArrowLeft size={15} /> Back to archive</Link><span>OPEN ARCHIVE · NO ACCOUNT</span></div>
    <header className="submission-heading">
      <div><span className="launch-label"><WandSparkles size={13} /> ADD YOUR MOVE TO THE RECORD</span><h1>Put your move<br /><em>on the record.</em></h1>
        <p>Share the moment, tell us who to credit, and our team will review the clip before it joins the archive.</p></div>
      <div className="submission-count"><strong>{sportsCatalog.length}</strong><span>SPORTS &<br />DISCIPLINES</span></div>
    </header>

    <div className="submission-layout">
      <form className="submission-form" onSubmit={(event) => { event.preventDefault(); upload(); }}>
        <section className="builder-step"><span className="builder-step-num">01</span><div className="builder-step-content"><h2>Place the move</h2>
          <label>Search sports<input value={sportSearch} onChange={(event) => setSportSearch(event.target.value)} placeholder={`Search ${sportsCatalog.length} sports and disciplines`} /></label>
          <label>Sport or discipline<select required value={draft.sport} onChange={(event) => {
            const next = sportsCatalog.find((item) => item.name === event.target.value) ?? sportsCatalog[0];
            setDraft((current) => ({ ...current, sport: next.name, customSport: "", move: next.moves[0], customMove: "" }));
            setSaved(false);
          }}>{visibleSports.map((item) => <option key={item.name} value={item.name}>{item.name === "Other Sport" ? "Other Sport · add a discipline" : item.name}</option>)}</select></label>
          {draft.sport === "Other Sport" && <label>Your sport or discipline<input maxLength={50} value={draft.customSport} onChange={(event) => update("customSport", event.target.value)} placeholder="Enter a sport not listed" /></label>}
          <label>Competition category<select value={draft.category} onChange={(event) => update("category", event.target.value)}>{participationCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Move name<select value={draft.move} onChange={(event) => update("move", event.target.value)}>{sport.moves.map((item) => <option key={item}>{item}</option>)}<option>Custom move</option></select></label>
          {draft.move === "Custom move" && <label>Your move name<input maxLength={60} required value={draft.customMove} onChange={(event) => update("customMove", event.target.value)} placeholder="Name your original move" /></label>}
        </div></section>

        <section className="builder-step"><span className="builder-step-num">02</span><div className="builder-step-content"><h2>Credit the person</h2>
          <label>Display name<input maxLength={50} required value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder="How your name should appear" /></label>
          <label>Handle<input maxLength={30} required value={draft.handle} onChange={(event) => update("handle", event.target.value)} placeholder="@yourhandle" /></label>
          <label>Team or personal brand <span className="optional-tag">OPTIONAL</span><input maxLength={60} value={draft.team} onChange={(event) => update("team", event.target.value)} placeholder="Team, club, or brand" /></label>
          <div className="design-choice"><span>Card finish</span><div><button type="button" className={draft.design === "holo" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, design: "holo" }))}>Holographic</button><button type="button" className={draft.design === "court" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, design: "court" }))}>Night court</button></div></div>
        </div></section>

        <section className="builder-step"><span className="builder-step-num">03</span><div className="builder-step-content"><h2>Attach the clip</h2>
          <label className="upload-drop"><Upload size={19} /><strong>{videoFile ? videoFile.name : "Choose a video from your device"}</strong><span>MP4, WebM, or MOV · up to 100 MB</span><input type="file" accept="video/mp4,video/webm,video/quicktime,.mov" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>
          {videoFile && <div className="selected-file"><FileVideo size={15} /><span>{formatBytes(videoFile.size)} · stays on your device until you submit</span><button type="button" aria-label="Remove selected video" onClick={() => chooseFile(null)}><X size={15} /></button></div>}
          {selectError && <p className="form-error" role="alert">{selectError}</p>}
          {videoUrl && <video className="local-video-preview" src={videoUrl} controls playsInline aria-label="Preview selected move clip" />}
        </div></section>

        <section className="builder-step"><span className="builder-step-num">04</span><div className="builder-step-content"><h2>Plan a merch match</h2>
          <p className="merch-helper">Browse the live Printful catalog and save an optional product idea with your card.</p>
          {merchCatalog.isLoading ? <p className="merch-status">Loading Printful catalog…</p> :
            merchCatalog.isError ? <p className="merch-status" role="status">Printful catalog is temporarily unavailable. Your card draft still works.</p> :
              <><label>Search merchandise<input value={merchSearch} onChange={(event) => setMerchSearch(event.target.value)} placeholder="Search shirts, hats, jerseys…" /></label>
                <label>Planned product<select value={draft.merchProductId} onChange={(event) => update("merchProductId", event.target.value)}>
                  <option value="">No merchandise association</option>
                  {visibleMerch.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.variantCount} variants</option>)}
                </select></label>
                {selectedMerch && <p className="merch-status">Selected: <strong>{selectedMerch.title}</strong>. This is a planning link only.</p>}
              </>}
          <p className="merch-safety">This remains a planning link only. After approval, the shared card keeps this selection. Owners can prepare private mockups in the Review desk.</p>
        </div></section>

        <section className="submission-consent">
          <div className="consent-heading"><ShieldCheck size={18} /><div><strong>One clear permission</strong><span>We review before anything is public.</span></div></div>
          <label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>I have the right to share this video and give the archive permission to review it and, if approved, display it as part of the public move archive.</span></label>
        </section>
        <div className="submission-safety"><LockKeyhole size={16} /><p><strong>Private until approved.</strong> Submitting sends your video to the archive team for moderation. It does not publish your clip.</p></div>
        {uploadError && <div className="upload-error" role="alert"><CircleAlert size={17} /><p>{uploadError}</p></div>}
        {progress !== null && <div className="upload-progress" role="status"><div className="upload-progress-head"><span>{progress === 100 ? "Upload complete" : "Uploading privately"}</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
        <div className="submission-actions"><button className="submission-save" type="button" onClick={saveDraft}>{saved ? <><Check size={16} /> Saved on this device</> : "Save local draft"}</button><button className="submit-primary" type="submit" disabled={!valid || progress !== null && progress < 100}>Send for review <Upload size={15} /></button></div>
        <p className="local-draft-note">Local draft saves card details and a merchandise planning link in this browser only. Submitting stores the selected catalog item with the card; it does not create a product or enable checkout.</p>
      </form>

      <aside className={`card-preview ${draft.design}`} aria-label="Move card preview">
        <div className="preview-top"><span>SIGNATURE MOVE</span><span>COMMUNITY · 01</span></div>
        <div className="preview-art"><div className="preview-orbit" /><span className="preview-mark">{draft.displayName.trim() ? draft.displayName.trim().slice(0, 2).toUpperCase() : "SM"}</span><span className="preview-category">{draft.category.toUpperCase()} · {submissionSport.toUpperCase()}</span><div className="preview-action"><Film size={18} /><span>{videoFile ? "CLIP READY FOR REVIEW" : "YOUR MOMENT GOES HERE"}</span></div></div>
        <div className="preview-info"><span>SIGNATURE MOVE</span><h2>{moveName || "Your move"}</h2><strong>{draft.displayName || "Your name"}</strong><p>{draft.handle ? (draft.handle.startsWith("@") ? draft.handle : `@${draft.handle}`) : "@yourhandle"}{draft.team ? ` · ${draft.team}` : ""}</p>{selectedMerch && <p className="preview-merch">PLANNED MATCH · {selectedMerch.title}</p>}</div>
        <div className="preview-foot"><span>COMMUNITY CARD</span><span>PREVIEW · NOT PUBLISHED</span></div>
        <div className="preview-caption"><ShieldCheck size={14} /><span>Card details preview only. The archive team reviews every video first.</span></div>
      </aside>
    </div>
  </main>;
}
