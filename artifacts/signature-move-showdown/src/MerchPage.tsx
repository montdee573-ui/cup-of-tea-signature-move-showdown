
import { Link } from "wouter";

const products = [
  { name: "Hats", collection: "Signature Collection", icon: "🧢" },
  { name: "T-Shirts", collection: "Signature Collection", icon: "👕" },
  { name: "Jerseys", collection: "Signature Move Collection", icon: "🏀" },
  { name: "Pants & Shorts", collection: "Signature Collection", icon: "👖" },
  { name: "Socks", collection: "Signature Collection", icon: "🧦" },
  { name: "Shoes", collection: "Signature Move Collection", icon: "👟" },
  { name: "Custom Player Jerseys", collection: "Personalized", icon: "🏆" },
  { name: "Gym Bags", collection: "Accessories", icon: "🎒" },
  { name: "Card Display Cases", collection: "Collectibles", icon: "✨" },
  { name: "Water Bottles", collection: "Accessories", icon: "💧" },
];

export default function MerchPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#080d1d",
      color: "white",
      padding: "45px 20px",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{ maxWidth: 1100, margin: "auto" }}>
        <Link href="/" style={{ color: "#53dce9" }}>
          ← Back to Cup of Tea
        </Link>

        <header style={{
          textAlign: "center",
          padding: "55px 10px"
        }}>
          <p style={{
            color: "#53dce9",
            letterSpacing: 3
          }}>
            SIGNATURE MOVE SHOWDOWN
          </p>

          <h1 style={{
            fontSize: "clamp(38px, 6vw, 70px)",
            margin: "15px 0"
          }}>
            CUP OF TEA MERCH
          </h1>

          <h2 style={{ color: "#d58cff" }}>
            Rep Your Move.
          </h2>

          <p>
            Your Move. Your Card. Your Story.
          </p>
          <p style={{ color: "#abb8ce" }}>
            More than a contest — it's a lifestyle.
          </p>
        </header>

        <h2>Explore the Collection</h2>

        <section style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 18,
          marginTop: 25
        }}>
          {products.map((product) => (
            <article key={product.name} style={{
              background: "#141b31",
              border: "1px solid #365176",
              borderRadius: 16,
              padding: 24,
              textAlign: "center"
            }}>
              <div style={{ fontSize: 46 }} aria-hidden="true">
                {product.icon}
              </div>

              <h3>{product.name}</h3>

              <p style={{
                color: "#53dce9",
                fontSize: 13
              }}>
                {product.collection}
              </p>

              <p style={{
                color: "#aebbd0",
                fontSize: 13
              }}>
                Product preview and customization
                will appear when the catalog
                is connected.
              </p>
            </article>
          ))}
        </section>

        <section style={{
          marginTop: 45,
          padding: 25,
          background: "#171329",
          border: "1px solid #754d97",
          borderRadius: 16,
          textAlign: "center"
        }}>
          <h2>Make It Your Signature</h2>
          <p>
            Explore personalized merchandise featuring
            approved contestant artwork, names,
            handles, and signature moves.
          </p>
          <p style={{ color: "#d6b0ff" }}>
            Product selection and ordering will be
            enabled after checkout and fulfillment
            verification.
          </p>
        </section>

        <footer style={{
          textAlign: "center",
          marginTop: 55,
          color: "#9caac0"
        }}>
          CUP OF TEA — SIGNATURE MOVE SHOWDOWN
          <p>
            Merchandise purchases do not affect
            contest votes or results.
          </p>
        </footer>
      </div>
    </main>
  );
}
