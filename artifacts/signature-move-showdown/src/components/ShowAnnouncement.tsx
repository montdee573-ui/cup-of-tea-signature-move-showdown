import { Link } from "wouter";

export default function ShowAnnouncement() {
  return <section className="launch-truth" aria-labelledby="show-week-heading" data-testid="show-week-announcement">
    <div className="truth-copy">
      <span className="launch-label">OFFICIAL SHOW ANNOUNCEMENT · ALL SPORTS</span>
      <h2 id="show-week-heading">Show Week · May 2027</h2>
      <p>Everybody’s got a move. Make the card. Show your style.</p>
      <p>The competition runs from launch through Show Week: Create &amp; Submit,
        Signature Move Showdown, then Championship Brackets. Show Week culminates
        in the Championship Final Faceoff, verified official winner announcement,
        Physical Champion Card award and celebration.</p>
      <p><strong>Exact Show Week dates and stage deadlines will be announced after owner confirmation.</strong></p>
      <p>The December 7–16, 2026 promoter campaign is the initial promotion only—not the competition end date.</p>
      <p>All sports welcome. Recreate a professional move or submit your own.
        Entry and community voting are free. An optional motion card is $2 plus
        applicable tax; purchases never affect votes, qualification or results.</p>
      <p>Professional athlete library target: 500 AI-generated, owner-approved cards.
        This is a target, not a published-card count.</p>
      <Link href="/submit" className="button-primary">Create &amp; submit your move</Link>
      <p>Official website: <a href="https://sigduel.com">SigDuel.com</a></p>
    </div>
  </section>;
}
