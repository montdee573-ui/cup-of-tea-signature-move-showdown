import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import {
  ArrowLeft, BadgeCheck, CircleAlert, ClipboardCheck, LockKeyhole,
  LogOut, ShieldCheck, Trophy,
} from "lucide-react";
import {
  getGetStudioSessionQueryKey,
  getListStudioContestResultsQueryKey,
  useClearStudioContestResult,
  useCreateStudioContestResult,
  useCreateStudioSession,
  useDeleteStudioSession,
  useGetStudioSession,
  useListStudioContestResults,
} from "@workspace/api-client-react";
import type { ContestResult } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";

const resultSchema = z.object({
  eventTitle: z.string().trim().min(1, "Enter the event name.").max(100),
  division: z.string().trim().min(1, "Enter the era or division.").max(80),
  winnerName: z.string().trim().min(1, "Enter the vote winner.").max(80),
  winnerHandle: z.string().trim().max(50),
  runnerUpName: z.string().trim().min(1, "Enter the runner-up.").max(80),
  winnerVotes: z.coerce.number().int().min(0, "Votes cannot be negative."),
  runnerUpVotes: z.coerce.number().int().min(0, "Votes cannot be negative."),
  coreScore: z.number().int().min(0).max(100).nullable(),
  base44Summary: z.string().trim().min(1, "Record the Base44 result.").max(2000),
  viralReelSummary: z.string().trim().min(1, "Record the Viral Reel result.").max(2000),
}).refine((value) => value.winnerName.toLowerCase() !== value.runnerUpName.toLowerCase(), {
  message: "Winner and runner-up must be different people.",
  path: ["runnerUpName"],
});

type ResultFormValues = z.infer<typeof resultSchema>;

const defaultValues: ResultFormValues = {
  eventTitle: "",
  division: "",
  winnerName: "",
  winnerHandle: "",
  runnerUpName: "",
  winnerVotes: 0,
  runnerUpVotes: 0,
  coreScore: null,
  base44Summary: "",
  viralReelSummary: "",
};

function ResultRecord({
  result,
  onClear,
  busy,
}: {
  result: ContestResult;
  onClear: (id: number, clearanceNote: string) => void;
  busy: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [clearanceNote, setClearanceNote] = useState("");
  const isCleared = result.status === "cleared";

  return <article className={`result-record ${isCleared ? "is-cleared" : ""}`} data-testid={`result-record-${result.id}`}>
    <header className="result-record-head">
      <div><span className="launch-label">{isCleared ? <BadgeCheck size={13} /> : <ClipboardCheck size={13} />} {isCleared ? "OFFICIAL · OWNER CLEARED" : "DRAFT · PRIVATE"}</span><h3>{result.eventTitle}</h3><p>{result.division}</p></div>
      <time dateTime={isCleared ? result.clearedAt ?? result.createdAt : result.createdAt}>{new Date(isCleared ? result.clearedAt ?? result.createdAt : result.createdAt).toLocaleString()}</time>
    </header>
    <div className="result-winner">
      <Trophy size={18} />
      <div><span>VOTE WINNER</span><strong>{result.winnerName}</strong>{result.winnerHandle && <small>{result.winnerHandle}</small>}</div>
      <b>{result.winnerVotes} votes</b>
    </div>
    <div className="result-stats">
      <span>Runner-up <strong>{result.runnerUpName}</strong> <b>{result.runnerUpVotes}</b></span>
      <span>C.O.R.E. technique score <strong>{result.coreScore === null ? "Not recorded" : `${result.coreScore}/100`}</strong></span>
    </div>
    <div className="result-source-grid">
      <div><span>CUP OF TEA / BASE44 NOTES</span><p>{result.base44Summary}</p></div>
      <div><span>VIRAL REEL / REPLIT NOTES</span><p>{result.viralReelSummary}</p></div>
    </div>
    {isCleared ? <div className="result-clearance-note"><ShieldCheck size={15} /><p><strong>Owner clearance</strong>{result.clearanceNote}</p></div> :
      <div className="result-clearance">
        <label className="result-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid={`checkbox-clear-result-${result.id}`} /><span>I verified both apps and confirm these are the final contest results.</span></label>
        <label className="result-clear-note">Clearance note<textarea value={clearanceNote} onChange={(event) => setClearanceNote(event.target.value)} maxLength={500} placeholder="Record how the result was checked." data-testid={`input-clearance-note-${result.id}`} /></label>
        <button type="button" className="result-clear-button" disabled={!confirmed || !clearanceNote.trim() || result.winnerVotes <= result.runnerUpVotes || busy} onClick={() => onClear(result.id, clearanceNote.trim())} data-testid={`button-clear-result-${result.id}`}>
          <ShieldCheck size={15} /> {busy ? "Saving clearance…" : "Clear official result"}
        </button>
        {result.winnerVotes <= result.runnerUpVotes && <p className="result-warning" role="status">This draft is tied or trailing. Resolve the result before clearing a vote winner.</p>}
      </div>}
  </article>;
}

export default function ContestResults() {
  const queryClient = useQueryClient();
  const session = useGetStudioSession({ query: { queryKey: getGetStudioSessionQueryKey(), retry: false } });
  const authenticated = Boolean(session.data?.authenticated);
  const results = useListStudioContestResults({
    query: {
      queryKey: getListStudioContestResultsQueryKey(),
      enabled: authenticated,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const createSession = useCreateStudioSession();
  const deleteSession = useDeleteStudioSession();
  const createResult = useCreateStudioContestResult();
  const clearResult = useClearStudioContestResult();
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [resultError, setResultError] = useState("");
  const form = useForm<ResultFormValues>({
    resolver: zodResolver(resultSchema),
    defaultValues,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetStudioSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListStudioContestResultsQueryKey() });
  };
  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    createSession.mutate({ data: { password } }, {
      onSuccess: () => { setPassword(""); refresh(); },
      onError: (error) => setLoginError(error instanceof Error ? error.message : "The passphrase was not accepted."),
    });
  };
  const saveDraft = form.handleSubmit((values) => {
    setResultError("");
    createResult.mutate({ data: values }, {
      onSuccess: () => {
        form.reset(defaultValues);
        void queryClient.invalidateQueries({ queryKey: getListStudioContestResultsQueryKey() });
      },
      onError: (error) => setResultError(error instanceof Error ? error.message : "Could not save this result draft."),
    });
  });
  const clearDraft = (id: number, clearanceNote: string) => {
    setResultError("");
    clearResult.mutate({ id, data: { confirm: true, clearanceNote } }, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListStudioContestResultsQueryKey() }),
      onError: (error) => setResultError(error instanceof Error ? error.message : "Could not clear this result."),
    });
  };
  const signOut = () => {
    deleteSession.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: getListStudioContestResultsQueryKey() });
        refresh();
      },
    });
  };

  return <main className="review-page result-page">
    <header className="review-topbar">
      <Link href="/" className="review-brand"><span className="brand-mark"><ClipboardCheck size={16} /></span><span>SIGNATURE MOVE<small>RESULT CLEARANCE</small></span></Link>
      <div className="result-top-links"><Link href="/review" className="review-back">Moderation desk</Link><Link href="/" className="review-back"><ArrowLeft size={14} /> Archive</Link></div>
    </header>

    {session.isLoading ? <section className="review-auth-loading" aria-label="Checking owner session"><span /><span /><span /></section> : !authenticated ? <section className="review-login-wrap">
      <div className="review-login-art"><div className="review-art-ring" /><div className="review-art-copy"><span>PRIVATE ROOM / 02</span><strong>Results<br />with proof.</strong><p>Only owner-cleared, verified results can become official.</p></div><span className="review-art-stamp">OWNER<br />CLEARANCE</span></div>
      <form className="review-login" onSubmit={signIn}>
        <span className="launch-label"><LockKeyhole size={13} /> OWNER ACCESS ONLY</span>
        <h1>Final<br /><em>results.</em></h1>
        <p>Sign in with the existing Studio passphrase to enter and clear results privately.</p>
        {session.data?.configured === false && <div className="review-alert"><CircleAlert size={16} /><span>Owner access is not configured on this server.</span></div>}
        {session.isError && <div className="review-alert"><CircleAlert size={16} /><span>Could not check owner access. Retry the connection.</span><button type="button" onClick={() => void session.refetch()} aria-label="Retry session check">Retry</button></div>}
        <label htmlFor="result-owner-password">Studio passphrase</label>
        <input type="text" name="username" autoComplete="username" value="studio-owner" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <input id="result-owner-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter passphrase" disabled={createSession.isPending} data-testid="input-result-owner-password" />
        {loginError && <p className="review-form-error" role="alert">{loginError}</p>}
        <button className="review-login-button" type="submit" disabled={session.data?.configured === false || !password.trim() || createSession.isPending} data-testid="button-result-owner-login"><LockKeyhole size={15} /> {createSession.isPending ? "Verifying access…" : "Open result desk"}</button>
        <div className="review-login-note"><ShieldCheck size={15} /><span>Results are private until you explicitly clear them. Nothing is emailed from this page.</span></div>
      </form>
    </section> : <section className="review-workspace result-workspace">
      <div className="review-heading">
        <div><span className="launch-label"><ShieldCheck size={13} /> PRIVATE STUDIO / FINAL RESULTS</span><h1>Clear the<br /><em>final.</em></h1><p>Record what both apps show, save a private draft, then explicitly clear an actual result.</p></div>
        <div className="review-heading-side"><div className="review-session-state"><span /> OWNER SESSION ACTIVE</div><button className="review-signout" type="button" onClick={signOut} disabled={deleteSession.isPending}><LogOut size={14} /> Sign out</button></div>
      </div>
      <div className="result-guardrail"><LockKeyhole size={17} /><p><strong>No live contest data is connected.</strong> Enter only verified results from both Cup of Tea/Base44 and Viral Reel/Replit. This saves a private record; it does not email or publish it.</p></div>
      <section className="result-entry-panel" aria-labelledby="result-entry-title">
        <div className="review-queue-heading"><div><span className="launch-label">OWNER ENTERED · NEVER FABRICATED</span><h2 id="result-entry-title">Record a final</h2></div></div>
        <Form {...form}>
          <form className="result-form" onSubmit={saveDraft}>
            <div className="result-fields two-col">
              <FormField control={form.control} name="eventTitle" render={({ field }) => <FormItem className="result-field"><FormLabel>Event name</FormLabel><FormControl><Input {...field} maxLength={100} placeholder="Cup of Tea Signature Move Showdown" data-testid="input-result-event" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="division" render={({ field }) => <FormItem className="result-field"><FormLabel>Era or division</FormLabel><FormControl><Input {...field} maxLength={80} placeholder="80s Legends · Quarterfinal" data-testid="input-result-division" /></FormControl><FormMessage /></FormItem>} />
            </div>
            <div className="result-fields two-col">
              <FormField control={form.control} name="winnerName" render={({ field }) => <FormItem className="result-field"><FormLabel>Vote winner</FormLabel><FormControl><Input {...field} maxLength={80} placeholder="Participant name" data-testid="input-result-winner" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="winnerHandle" render={({ field }) => <FormItem className="result-field"><FormLabel>Winner handle</FormLabel><FormControl><Input {...field} maxLength={50} placeholder="@handle (optional)" data-testid="input-result-handle" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="runnerUpName" render={({ field }) => <FormItem className="result-field"><FormLabel>Runner-up</FormLabel><FormControl><Input {...field} maxLength={80} placeholder="Runner-up name" data-testid="input-result-runner-up" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="winnerVotes" render={({ field }) => <FormItem className="result-field"><FormLabel>Winner votes</FormLabel><FormControl><Input type="number" min={0} step={1} {...field} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-result-winner-votes" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="runnerUpVotes" render={({ field }) => <FormItem className="result-field"><FormLabel>Runner-up votes</FormLabel><FormControl><Input type="number" min={0} step={1} {...field} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-result-runner-up-votes" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="coreScore" render={({ field }) => <FormItem className="result-field"><FormLabel>C.O.R.E. technique score <span>optional</span></FormLabel><FormControl><Input type="number" min={0} max={100} step={1} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} placeholder="0–100" data-testid="input-result-core-score" /></FormControl><FormMessage /></FormItem>} />
            </div>
            <div className="result-fields two-col">
              <FormField control={form.control} name="base44Summary" render={({ field }) => <FormItem className="result-field"><FormLabel>Cup of Tea / Base44 result notes</FormLabel><FormControl><Textarea {...field} rows={4} maxLength={2000} placeholder="Record the completed bracket, vote totals, and final shown in Base44." data-testid="input-result-base44-notes" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="viralReelSummary" render={({ field }) => <FormItem className="result-field"><FormLabel>Viral Reel / Replit result notes</FormLabel><FormControl><Textarea {...field} rows={4} maxLength={2000} placeholder="Record the matching verified entry and result information shown in Replit." data-testid="input-result-replit-notes" /></FormControl><FormMessage /></FormItem>} />
            </div>
            {resultError && <div className="review-alert" role="alert"><CircleAlert size={16} /><span>{resultError}</span></div>}
            <div className="result-form-actions"><p>Saving creates a private draft only. Ties cannot be cleared as a vote win.</p><button className="review-login-button" type="submit" disabled={createResult.isPending} data-testid="button-save-result-draft">{createResult.isPending ? "Saving draft…" : "Save private draft"}</button></div>
          </form>
        </Form>
      </section>
      <section className="result-history" aria-labelledby="result-history-title">
        <div className="review-queue-heading"><div><span className="launch-label">PRIVATE RECORDS</span><h2 id="result-history-title">Drafts and cleared results</h2></div><button className="showdown-refresh" type="button" onClick={() => void results.refetch()} disabled={results.isFetching}>Refresh</button></div>
        {clearResult.isError && <div className="review-alert" role="alert"><CircleAlert size={16} /><span>{clearResult.error instanceof Error ? clearResult.error.message : "Could not clear this result."}</span></div>}
        {results.isLoading ? <div className="showdown-loading" role="status">Loading private results…</div> : results.isError ? <div className="review-alert" role="alert"><CircleAlert size={16} /><span>Private results could not be loaded.</span><button type="button" onClick={() => void results.refetch()}>Retry</button></div> : !results.data?.length ? <div className="review-empty"><ClipboardCheck size={24} /><h2>No results recorded.</h2><p>There is no final outcome yet. Do not create a draft until both app results have been checked.</p></div> :
          <div className="result-record-list">{results.data.map((result) => <ResultRecord key={result.id} result={result} onClear={clearDraft} busy={clearResult.isPending && clearResult.variables?.id === result.id} />)}</div>}
      </section>
    </section>}
  </main>;
}
