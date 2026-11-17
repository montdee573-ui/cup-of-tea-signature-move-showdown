
import { Link } from "wouter";

const options = [
  {
    title: "Enter the Contest",
    price: "FREE",
    description:
      "Submit your signature move and create a trading-card entry. Voting is free.",
    href: "/submit",
    action: "Start Free Entry",
  },
  {
    title: "Motion Card",
    price: "$2 — WHEN ENABLED",
    description:
      "After your entry is approved, choose an optional four-second animated motion card. Payment is not active until verified.",
    href: "/submit",
    action: "Start With Your Entry",
  },
  {
    title: "Merchandise",
    price: "COMING SOON",
    description:
      "Explore merchandise ideas for your signature move. Product ordering is not enabled yet.",
    href: "/submit",
    action: "Plan Your Merchandise",
  },
];

export default function ContestHome() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080d1d",
        color: "#ffffff",
        padding: "48px 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "auto" }}>
        <header style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ color: "#43ddec", letterSpacing: 3 }}>
            SIGNATURE MOVE SHOWDOWN
          </p>
          <h1 style={{ fontSize: "clamp(42px, 7vw, 76px)" }}>
            CUP OF TEA
          </h1>
          <p>
            One contest. Your move. Your card. Your moment.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          {options.map((option) => (
            <article
              key={option.title}
              style={{
                background: "#131d35",
                border: "1px solid #28526b",
                borderRadius: 18,
                padding: 26,
              }}
            >
              <p style={{ color: "#43ddec" }}>
                {option.price}
              </p>
              <h2>{option.title}</h2>
              <p style={{ lineHeight: 1.7, minHeight: 110 }}>
                {option.description}
              </p>
              <Link
                href={option.href}
                style={{
                  display: "inline-block",
                  padding: "13px 18px",
                  background: "#43ddec",
                  color: "#061020",
                  fontWeight: "bold",
                  borderRadius: 9,
                  textDecoration: "none",
                }}
              >
                {option.action}
              </Link>
            </article>
          ))}
        </section>

        <nav
          aria-label="Contest navigation"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 22,
            flexWrap: "wrap",
            marginTop: 45,
          }}
        >
          <Link href="/showdown">View Showdowns & Vote</Link>
          <Link href="/launch">Contest Information</Link>
          <Link href="/review">Owner Review</Link>
        </nav>

        <p
          style={{
            textAlign: "center",
            color: "#aab9cb",
            marginTop: 35,
          }}
        >
          Free entry and voting. Optional purchases never
          affect votes, eligibility, or winners.
        </p>
      </div>
    </main>
  );
}
