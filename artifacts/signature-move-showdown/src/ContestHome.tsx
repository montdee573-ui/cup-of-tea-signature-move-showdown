import { Link } from "wouter";

const stageTwoPreview = "https://cup-of-tea-stage2-preview.montdee573.chatgpt.site/#cards";
const finalShowPreview = "https://cup-of-tea-open-dee.montdee573.chatgpt.site/";

export default function ContestHome() {
  return (
    <main style={{ minHeight: "100vh", background: "#080d1d", color: "#fff", padding: "48px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "auto" }}>
        <header style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ color: "#43ddec", letterSpacing: 3 }}>SIGNATURE MOVE SHOWDOWN</p>
          <h1 style={{ fontSize: "clamp(42px, 7vw, 76px)", margin: "12px 0" }}>CUP OF TEA</h1>
          <p style={{ fontSize: 18 }}>Film your signature move. See what it can become.</p>
        </header>

        <section aria-label="Contest stages" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 20 }}>
          <article style={panel}>
            <p style={eyebrow}>STAGE 1 · REPLIT</p>
            <h2>Submit your move</h2>
            <p>Start here with your signature-move video. The planned optional $2 motion card turns a clip of up to 90 seconds into a four-second showcase once checkout and generation are enabled.</p>
            <Link href="/submit" style={button}>Open the entry form</Link>
          </article>
          <article style={panel}>
            <p style={eyebrow}>STAGE 2 · TRADING CARDS</p>
            <h2>See your move illustrated</h2>
            <p>The planned trading-card flow turns the paid motion card into an illustrated still. Free pre-bracket voting allows one counted like per voter per card.</p>
            <a href={stageTwoPreview} style={button}>Open Stage 2 preview</a>
            <small>Private preview. ChatGPT sign-in may be required.</small>
          </article>
          <article style={panel}>
            <p style={eyebrow}>STAGE 3 · FINAL BRACKET</p>
            <h2>Qualify for the show</h2>
            <p>A Stage 2 card qualifies at 1,000 or more verified unique likes when its paid Stage 1 origin is verified. The final bracket and May 2027 show dates are pending.</p>
            <a href={finalShowPreview} style={button}>Open contest site preview</a>
          </article>
        </section>

        <nav aria-label="More contest information" style={{ display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap", marginTop: 32 }}>
          <Link href="/launch">Contest information</Link>
          <Link href="/merch">Explore merchandise</Link>
        </nav>
        <p style={{ textAlign: "center", color: "#aab9cb", marginTop: 24 }}>
          Free entry and voting. Purchases never add votes. These previews show the planned sequence. Live card and vote transfers between sites are pending.
        </p>
      </div>
    </main>
  );
}

const panel = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  background: "#131d35",
  border: "1px solid #28526b",
  borderRadius: 18,
  padding: 24,
  lineHeight: 1.55,
};
const eyebrow = { color: "#43ddec", fontWeight: 700 };
const button = {
  alignSelf: "flex-start",
  marginTop: "auto",
  padding: "11px 15px",
  background: "#43ddec",
  color: "#061020",
  fontWeight: 700,
  borderRadius: 9,
  textDecoration: "none",
};
