import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles } from 'lucide-react';
import fadeawayArt from '@assets/The_Fadeaway_Basketball_Print_1795888492641.png';
import fastFeetArt from '@assets/Fast_Feet_Footwork_Showdown_1795888452585.png';
import ownMoveArt from '@assets/Own_your_move_crown_graphic_1795888411220.png';
import spinArt from '@assets/Teal_and_Gold_Spin_Move_1795888411221.png';
import chicagoArt from '@assets/Chicago_Moves_Skyline_Emblem_1795888492641.png';
import heavyBagArt from '@assets/Cup_of_Tea_Heavy_Bag_Boxer_1795888366220.png';
import baseballArt from '@assets/Neon_pull-side_baseball_swing_1795888411218.png';
import pomPomArt from '@assets/Cup_of_Tea__Pom-Pom_Routine_1795888555234.png';
import crossoverArt from '@assets/The_Crossover_Basketball_in_Motion_1795888492641.png';
import fourSecondsArt from '@assets/Four_Seconds_Stopwatch_Showdown_1795888452586.png';
import crownedCupArt from '@assets/Crowned_Cup_of_Tea_1795888555234.png';
import motionClubArt from '@assets/Motion_Card_Club_Lightning_Trio_1795888492639.png';
import chestCrownCupMockup from '@assets/Black_T-Shirt_with_Gold_Crown_and_Teacup_Emblem_1795888567327.png';
import fourSecondsGraphic from '@assets/Name-free_standalone_T-shirt_graphic_1795888452587.png';
import fastFeetGraphic from '@assets/Name-free_vintage_T-shirt_graphic(1)_1795888452587.png';

type MoveSlide = {
  title: string;
  sport: string;
  garment: string;
  garmentType: 'tee' | 'socks' | 'hoodie' | 'joggers' | 'cap';
  note: string;
  art: string;
  garmentArt?: string;
  mockupArt?: string;
  demoCard?: boolean;
  garmentTone: string;
  mark?: string;
};

const slides: MoveSlide[] = [
  { title: 'Fadeaway', sport: 'Basketball · shot craft', garment: 'Graphic tee', garmentType: 'tee', note: 'A clean release, held in the air just a beat longer.', art: fadeawayArt, garmentTone: '#c88919' },
  { title: 'Step-over', sport: 'Football · footwork', garment: 'Crew socks', garmentType: 'socks', note: 'A quick feint with a little theatre in the footwork.', art: fastFeetArt, garmentArt: fastFeetArt, demoCard: true, garmentTone: '#13bcae' },
  { title: 'Kickflip', sport: 'Skate · board control', garment: 'Pullover hoodie', garmentType: 'hoodie', note: 'A graphic study in lift, rotation, and landing.', art: ownMoveArt, demoCard: true, garmentTone: '#d49d32' },
  { title: 'Dance-spin', sport: 'Dance · rotation', garment: 'Track joggers', garmentType: 'joggers', note: 'A full turn, balanced by the smallest shift of weight.', art: spinArt, garmentTone: '#0eaa9f' },
  { title: 'Slip-and-roll', sport: 'Boxing · defense', garment: 'Low-profile cap', garmentType: 'cap', note: 'The quiet move that makes the next one possible.', art: heavyBagArt, demoCard: true, garmentTone: '#a844c6' },
  { title: 'Heavy Bag Combo', sport: 'Boxing · combination', garment: 'Ring-side tee', garmentType: 'tee', note: 'A sequence in rhythm, power, and controlled follow-through.', art: heavyBagArt, garmentTone: '#8345b7' },
  { title: 'Pull-Side Swing', sport: 'Baseball · hitting', garment: 'Baseball cap', garmentType: 'cap', note: 'The hips turn first. The barrel follows through.', art: baseballArt, garmentTone: '#5637a2' },
  { title: 'Pom-Pom Routine', sport: 'Cheer · choreography', garment: 'Warm-up joggers', garmentType: 'joggers', note: 'Counts, lines, and a finish that fills the frame.', art: pomPomArt, garmentTone: '#d448a5' },
  { title: 'Crossover', sport: 'Basketball · handle', garment: 'Crew socks', garmentType: 'socks', note: 'A change of direction built on timing and a low center.', art: crossoverArt, garmentTone: '#13a8bb' },
  { title: 'Fast Feet', sport: 'Footwork · agility', garment: 'Performance socks', garmentType: 'socks', note: 'Small steps. Fast decisions. No wasted motion.', art: fastFeetArt, garmentArt: fastFeetGraphic, garmentTone: '#13bcae' },
  { title: 'Four Seconds', sport: 'Showdown · the moment', garment: 'Stopwatch graphic tee', garmentType: 'tee', note: 'A tiny window can hold an entire story.', art: fourSecondsArt, garmentArt: fourSecondsGraphic, garmentTone: '#df641f' },
  { title: 'Chicago Moves', sport: 'City · movement', garment: 'Skyline cap', garmentType: 'cap', note: 'A city-shaped tribute to the moves that travel.', art: chicagoArt, garmentTone: '#0b9db7' },
  { title: 'Crowned Cup', sport: 'Cup of Tea · signature', garment: 'Classic tee', garmentType: 'tee', note: 'A simple emblem for the archive, with an optional Motion Card Club mark.', art: crownedCupArt, mockupArt: chestCrownCupMockup, garmentTone: '#d2a43b', mark: 'Motion Card Club mark optional' },
];

function GarmentMockup({ slide }: { slide: MoveSlide }) {
  return (
    <div className={`move-merch-garment move-merch-garment--${slide.garmentType}`} role="img" aria-label={`${slide.garment} concept mockup`}>
      <div className="move-merch-product-stage">
        <svg className="move-merch-product" viewBox="0 0 200 150" aria-hidden="true">
          <defs>
            <linearGradient id="move-merch-cloth" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={`color-mix(in srgb, ${slide.garmentTone}, #fff 10%)`} />
              <stop offset="1" stopColor={`color-mix(in srgb, ${slide.garmentTone}, #0b0d15 72%)`} />
            </linearGradient>
          </defs>
          {slide.garmentType === 'tee' && <>
            <path className="move-merch-product-main" d="M57 17 77 9q23 15 46 0l20 8 34 31-19 20-20-14 4 82H58l4-82-20 14-19-20z" />
            <path className="move-merch-product-detail" d="M78 10q22 23 44 0" />
          </>}
          {slide.garmentType === 'hoodie' && <>
            <path className="move-merch-product-main" d="M63 18 78 11q22 12 44 0l15 7 34 31-18 21-21-16 5 79H63l5-79-21 16-18-21z" />
            <path className="move-merch-product-main" d="M79 12q21-12 42 0l-6 21H85z" />
            <path className="move-merch-product-detail" d="M86 34v23m28-23v23M74 96q26-11 52 0l-4 18q-22 8-44 0z" />
          </>}
          {slide.garmentType === 'joggers' && <>
            <path className="move-merch-product-main" d="M55 12h90l-8 47-8 80h-34l-4-66-14 66H43l8-80z" />
            <path className="move-merch-product-detail" d="M56 20h88M99 59l-4 18" />
          </>}
          {slide.garmentType === 'socks' && <>
            <path className="move-merch-product-main" d="M51 18h38v62q0 10 11 12l17 6q8 3 6 12t-13 9H57q-12 0-12-12V30q0-12 6-12zm62 0h38v62q0 10 11 12l17 6q8 3 6 12t-13 9h-53q-12 0-12-12V30q0-12 6-12z" />
            <path className="move-merch-product-detail" d="M51 31h38m24 0h38" />
          </>}
          {slide.garmentType === 'cap' && <>
            <path className="move-merch-product-main" d="M38 91q4-53 53-66 60-15 75 44l-2 22H38z" />
            <path className="move-merch-product-main" d="M38 91q27-18 67-12 44 4 64 12-8 25-69 25-47 0-62-25z" />
            <path className="move-merch-product-detail" d="M99 29q-8 31-4 54" />
          </>}
        </svg>
        <img className="move-merch-product-print" src={slide.garmentArt ?? slide.art} alt="" />
        {slide.mark && <img className="move-merch-product-mark" src={motionClubArt} alt="" />}
      </div>
      <span>{slide.garment}</span>
    </div>
  );
}

export default function MoveMerchCollection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const active = slides[activeIndex];
  const autoPaused = userPaused || isHovered || isFocused || isHidden || reducedMotion;

  const go = useCallback((direction: number) => {
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(query.matches);
    updateMotion();
    query.addEventListener('change', updateMotion);
    const updateVisibility = () => setIsHidden(document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      query.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (autoPaused) return undefined;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), 7200);
    return () => window.clearInterval(timer);
  }, [autoPaused, activeIndex]);

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocused(false);
  };

  return (
    <section
      className="move-merch"
      aria-labelledby="move-merch-title"
      data-testid="move-merch-collection"
      ref={rootRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={onBlur}
    >
      <header className="move-merch-heading">
        <div>
          <div className="move-merch-kicker"><Sparkles size={13} aria-hidden="true" /> THE MOVE MERCH COLLECTION <span>01 — {String(slides.length).padStart(2, '0')}</span></div>
          <h2 id="move-merch-title">A play, <em>kept in motion.</em></h2>
          <p>Archive-inspired garment studies, paired with the move that sparked each one.</p>
        </div>
        <div className="move-merch-edition">A CREATIVE SHOWCASE<br /><strong>NOT A SHOP</strong></div>
      </header>

      <div className="move-merch-stage" aria-live="off">
        <div className="move-merch-index"><span>{String(activeIndex + 1).padStart(2, '0')}</span><i />{String(slides.length).padStart(2, '0')}</div>
        <div className="move-merch-art-panel">
          <div className="move-merch-art-top"><span>VIRAL REEL / MOVE STUDY</span><span>{active.sport.toUpperCase()}</span></div>
          <div className="move-merch-card">
            {active.demoCard ? <div className="move-merch-demo-art">
              <span>DEMO / MOVE STUDY</span>
              <strong>{active.title.toUpperCase()}</strong>
              <small>{active.sport.toUpperCase()}</small>
              <i>VIRAL REEL · CONCEPT CARD</i>
            </div> : <img src={active.art} alt={`${active.title} concept artwork`} />}
            <span className="move-merch-demo-stamp">DEMO<br />MERCH CONCEPT</span>
            <span className="move-merch-card-name">{active.title}</span>
          </div>
          <div className="move-merch-art-foot"><span>COLLECTIBLE CARD IDEA</span><span>NOT FOOTAGE / NOT ENDORSEMENT</span></div>
        </div>

        <div className="move-merch-copy">
          <div className="move-merch-copy-label">MOVE CARD <span>×</span> GARMENT STUDY</div>
          <h3>{active.title}</h3>
          <div className="move-merch-sport">{active.sport}</div>
          <p className="move-merch-note">{active.note}</p>
          <div className="move-merch-divider" />
          <div className="move-merch-garment-label"><span>CONCEPT GARMENT</span><span>DEMO ONLY</span></div>
          <div className="move-merch-garment-wrap">
            {active.mockupArt ? <img className="move-merch-garment-img" src={active.mockupArt} alt={`${active.garment} concept mockup`} /> : <GarmentMockup slide={active} />}
          </div>
          <div className="move-merch-garment-name">{active.garment}</div>
          {active.mark && <p className="move-merch-optional">{active.mark}</p>}
        </div>
      </div>

      <footer className="move-merch-controls">
        <div className="move-merch-control-group" aria-label="Slideshow controls">
          <button type="button" className="move-merch-control move-merch-play" onClick={() => setUserPaused((paused) => !paused)} aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'} data-testid="button-merch-pause-play">
            {userPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            <span>{userPaused ? 'PLAY' : 'PAUSE'}</span>
          </button>
          <button type="button" className="move-merch-control move-merch-arrow" onClick={() => go(-1)} aria-label="Previous concept" data-testid="button-merch-previous"><ArrowLeft size={16} aria-hidden="true" /></button>
          <button type="button" className="move-merch-control move-merch-arrow" onClick={() => go(1)} aria-label="Next concept" data-testid="button-merch-next"><ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="move-merch-progress" aria-label={`Slide ${activeIndex + 1} of ${slides.length}`}>
          {slides.map((slide, index) => <button key={slide.title} type="button" className={index === activeIndex ? 'is-current' : ''} onClick={() => setActiveIndex(index)} aria-label={`Go to ${slide.title} concept`} aria-current={index === activeIndex ? 'step' : undefined} data-testid={`button-merch-slide-${index + 1}`}><span /></button>)}
        </div>
        <div className="move-merch-autoplay" data-testid="status-merch-autoplay">{reducedMotion ? 'AUTO OFF · REDUCED MOTION' : autoPaused ? 'ON HOLD' : 'AUTO · 7.2 SEC'}</div>
      </footer>
      <p className="move-merch-disclaimer" data-testid="text-merch-disclaimer"><strong>Concepts only.</strong> Supplied art is shown as still artwork; these are not verified athlete identities, licensed or approved products, real footage, endorsements, or contest results. Buying merch is optional and does not affect contest entry, voting, or bracket results.</p>
    </section>
  );
}
