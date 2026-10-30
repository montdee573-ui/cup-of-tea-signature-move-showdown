import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Film, ShieldCheck, Upload, WandSparkles } from "lucide-react";
import { Link } from "wouter";
import { useListMerchCatalog } from "@workspace/api-client-react";
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
  merchProductId: string;
};

const emptyDraft: Draft = {
  sport: "Basketball",
  customSport: "",
  category: "Open",
  move: "Crossover",
  customMove: "",
  displayName: "",
  handle: "",
  team: "",
  merchProductId: "",
};

export default function SubmissionBuilder() {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem("cup-of-tea-card-draft");
      return saved ? { ...emptyDraft, ...JSON.parse(saved) as Partial<Draft> } : emptyDraft;
    } catch {
      return emptyDraft;
    }
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [sportSearch, setSportSearch] = useState("");
  const [merchSearch, setMerchSearch] = useState("");
  const [design, setDesign] = useState<"holo" | "court">("holo");
  const merchCatalog = useListMerchCatalog();
  const sport = sportsCatalog.find((item) => item.name === draft.sport) ?? sportsCatalog[0];
  const visibleSports = useMemo(() => {
    const matches = sportsCatalog.filter((item) => item.name.toLowerCase().includes(sportSearch.trim().toLowerCase()));
    return matches.some((item) => item.name === draft.sport) ? matches : [sport, ...matches];
  }, [draft.sport, sport, sportSearch]);
  const visibleMerch = useMemo(() => (merchCatalog.data ?? []).filter((item) =>
    item.title.toLowerCase().includes(merchSearch.trim().toLowerCase())), [merchCatalog.data, merchSearch]);
  const selectedMerch = (merchCatalog.data ?? []).find((item) => String(item.id) === draft.merchProductId);
  const moveName = draft.move === "Custom move" ? draft.customMove || "Your signature move" : draft.move;
  const videoUrl = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : null, [videoFile]);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const saveDraft = () => {
    localStorage.setItem("cup-of-tea-card-draft", JSON.stringify(draft));
    setSaved(true);
  };

  return <main className="submission-page">
    <div className="submission-topline"><Link href="/" className="submission-back"><ArrowLeft size={15} /> Back to archive</Link><span>PUBLIC CARD BUILDER · NO ACCOUNT</span></div>
    <header className="submission-heading">
      <div><span className="launch-label"><WandSparkles size={13} /> YOUR MOVE, YOUR CARD</span><h1>Make your<br /><em>signature card.</em></h1>
        <p>Choose a sport and move, add your name, then preview a collectible card. Nothing is published from this preview.</p></div>
      <div className="submission-count"><strong>{sportsCatalog.length}</strong><span>SPORTS &<br />DISCIPLINES</span></div>
    </header>

    <div className="submission-layout">
      <form className="submission-form" onSubmit={(event) => { event.preventDefault(); saveDraft(); }}>
        <section className="builder-step"><span className="builder-step-num">01</span><div className="builder-step-content"><h2>Choose your sport</h2>
          <label>Search sports<input value={sportSearch} onChange={(event) => setSportSearch(event.target.value)} placeholder="Search 37 sports and disciplines" /></label>
          <label>Sport or discipline<select value={draft.sport} onChange={(event) => {
            const next = sportsCatalog.find((item) => item.name === event.target.value) ?? sportsCatalog[0];
            setDraft((current) => ({ ...current, sport: next.name, customSport: "", move: next.moves[0], customMove: "" }));
            setSaved(false);
          }}>{visibleSports.map((item) => <option key={item.name} value={item.name}>{item.name === "Other Sport" ? "Other Sport · add a discipline" : item.name}</option>)}</select></label>
          {draft.sport === "Other Sport" && <label>Your sport or discipline<input maxLength={60} value={draft.customSport} onChange={(event) => update("customSport", event.target.value)} placeholder="Enter a sport not listed" /></label>}
          <label>Competition category<select value={draft.category} onChange={(event) => update("category", event.target.value)}>{participationCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div></section>

        <section className="builder-step"><span className="builder-step-num">02</span><div className="builder-step-content"><h2>Name the move</h2>
          <label>Signature move<select value={draft.move} onChange={(event) => update("move", event.target.value)}>{sport.moves.map((item) => <option key={item}>{item}</option>)}<option>Custom move</option></select></label>
          {draft.move === "Custom move" && <label>Your move name<input maxLength={60} value={draft.customMove} onChange={(event) => update("customMove", event.target.value)} placeholder="Name your original move" /></label>}
        </div></section>

        <section className="builder-step"><span className="builder-step-num">03</span><div className="builder-step-content"><h2>Make it yours</h2>
          <label>Display name<input maxLength={50} value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder="Name shown on your card" /></label>
          <label>Handle<input maxLength={30} value={draft.handle} onChange={(event) => update("handle", event.target.value)} placeholder="@yourhandle" /></label>
          <label>Team or personal brand <span className="optional-tag">OPTIONAL</span><input maxLength={60} value={draft.team} onChange={(event) => update("team", event.target.value)} placeholder="Team, club, or brand" /></label>
          <div className="design-choice"><span>Card finish</span><div><button type="button" className={design === "holo" ? "selected" : ""} onClick={() => setDesign("holo")}>Holographic</button><button type="button" className={design === "court" ? "selected" : ""} onClick={() => setDesign("court")}>Night court</button></div></div>
        </div></section>

        <section className="builder-step"><span className="builder-step-num">04</span><div className="builder-step-content"><h2>Add a move clip</h2>
          <label className="upload-drop"><Upload size={19} /><strong>{videoFile ? videoFile.name : "Choose a video from your device"}</strong><span>Local preview only · nothing uploads yet</span><input type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} /></label>
          {videoUrl && <video className="local-video-preview" src={videoUrl} controls playsInline />}
        </div></section>

        <section className="builder-step"><span className="builder-step-num">05</span><div className="builder-step-content"><h2>Plan a merch match</h2>
          <p className="merch-helper">Browse the live Printful catalog and attach a product idea to this private card draft.</p>
          {merchCatalog.isLoading ? <p className="merch-status">Loading Printful catalog…</p> :
            merchCatalog.isError ? <p className="merch-status" role="status">Printful catalog is temporarily unavailable. Your card draft still works.</p> :
              <><label>Search merchandise<input value={merchSearch} onChange={(event) => setMerchSearch(event.target.value)} placeholder="Search shirts, hats, jerseys…" /></label>
                <label>Planned product<select value={draft.merchProductId} onChange={(event) => update("merchProductId", event.target.value)}>
                  <option value="">No merchandise association</option>
                  {visibleMerch.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.variantCount} variants</option>)}
                </select></label>
                {selectedMerch && <p className="merch-status">Selected: <strong>{selectedMerch.title}</strong>. This is a planning link only.</p>}
              </>}
          <p className="merch-safety">No Printful product, mockup, order, checkout, or sale is created from this page.</p>
        </div></section>

        <div className="submission-safety"><ShieldCheck size={17} /><p><strong>Review before sharing.</strong> This card stays private in this browser. Video upload, review, and public publishing are not enabled yet.</p></div>
        <button className="submission-save" type="submit">{saved ? <><Check size={16} /> Draft saved on this device</> : "Save private draft"}</button>
      </form>

      <aside className={`card-preview ${design}`} aria-label="Live card preview">
        <div className="preview-top"><span>CUP OF TEA</span><span>ORIGINAL MOVE · 01</span></div>
        <div className="preview-art"><div className="preview-orbit" /><span className="preview-mark">{draft.displayName.trim() ? draft.displayName.trim().slice(0, 2).toUpperCase() : "VR"}</span><span className="preview-category">{draft.category.toUpperCase()} · {(draft.sport === "Other Sport" ? draft.customSport || "OTHER SPORT" : draft.sport).toUpperCase()}</span><div className="preview-action"><Film size={18} /><span>{videoFile ? "CLIP SELECTED" : "YOUR MOMENT GOES HERE"}</span></div></div>
        <div className="preview-info"><span>SIGNATURE MOVE</span><h2>{moveName}</h2><strong>{draft.displayName || "Your name"}</strong><p>{draft.handle ? (draft.handle.startsWith("@") ? draft.handle : `@${draft.handle}`) : "@yourhandle"}{draft.team ? ` · ${draft.team}` : ""}</p></div>
        <div className="preview-foot"><span>COMMUNITY CARD</span><span>PREVIEW · NOT PUBLISHED</span></div>
      </aside>
    </div>
  </main>;
}
