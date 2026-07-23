import React from 'react';
import { Link } from 'react-router-dom';
import { Workflow, BookOpen, GitBranch, ArrowRight } from 'lucide-react';
import './landing.css';

/* HashRouter owns the URL fragment, so in-page anchors must scroll manually. */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Landing() {
  return (
    <div className="min-h-dvh bg-steel-950 text-steel-100 flex flex-col">
      <TopBar />
      <main className="flex-1">
        <Hero />
        <FeaturePanels />
        <WorkflowStrip />
        <CtaBand />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function TopBar() {
  return (
    <header className="sticky top-0 z-40 h-12 bg-steel-900/95 backdrop-blur border-b border-steel-700">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-volt flex items-center justify-center">
            <Workflow className="w-4 h-4 text-steel-950" />
          </div>
          <span className="font-semibold text-sm tracking-wide">QuestFlow</span>
          <span className="hidden sm:inline font-hud text-[10px] text-steel-500 border border-steel-700 rounded px-1.5 py-0.5">
            quest design engine
          </span>
        </div>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => scrollToSection('panels')}
            className="hidden sm:block px-3 py-1.5 text-sm text-steel-400 hover:text-steel-100 rounded-md hover:bg-steel-800/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('workflow')}
            className="hidden sm:block px-3 py-1.5 text-sm text-steel-400 hover:text-steel-100 rounded-md hover:bg-steel-800/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Workflow
          </button>
          <Link
            to="/login"
            className="px-3 py-1.5 text-sm text-steel-100 border border-steel-600 rounded-md hover:bg-steel-800 transition-colors focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            className="px-3 py-1.5 text-sm font-semibold text-steel-950 bg-volt rounded-md hover:brightness-95 transition-[filter] focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Start building
          </Link>
        </nav>
      </div>
    </header>
  );
}


/* ------------------------------------------------------------------ */
/* Hero: headline + faux quest-builder viewport                        */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="border-b border-steel-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-10 lg:gap-12 items-center">
        <div>
          <p className="lp-fade font-hud text-xs text-pulse tracking-widest mb-4">
            {'// RAG-GROUNDED QUEST GENERATION'}
          </p>
          <h1
            className="lp-fade font-display font-bold uppercase text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-5"
            style={{ animationDelay: '0.08s' }}
          >
            Quests grounded
            <br />
            in <span className="text-volt">your world</span>.
          </h1>
          <p
            className="lp-fade text-steel-400 text-base leading-relaxed max-w-md mb-8"
            style={{ animationDelay: '0.16s' }}
          >
            QuestFlow reads your game's lore, drafts questlines that fit it, and gives
            every NPC a pixel sprite — then ships the whole thing to your repo.
          </p>
          <div className="lp-fade flex flex-wrap items-center gap-3" style={{ animationDelay: '0.24s' }}>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-volt text-steel-950 font-semibold text-sm rounded-md hover:brightness-95 transition-[filter] focus-visible:outline-2 focus-visible:outline-pulse"
            >
              Start building
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => scrollToSection('workflow')}
              className="px-5 py-2.5 text-sm text-steel-100 border border-steel-600 rounded-md hover:bg-steel-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-pulse"
            >
              See the workflow
            </button>
          </div>
        </div>

        <ViewportPanel />
      </div>
    </section>
  );
}

interface NodeSpec {
  title: string;
  type: string;
  typeClass: string;
  objective: string;
  left: string;
  top: string;
  delay: string;
  selected?: boolean;
  grounded?: string;
  mobileHidden?: boolean;
}

const NODES: NodeSpec[] = [
  {
    title: 'The Ashen Gate',
    type: 'start',
    typeClass: 'text-pulse border-pulse/40',
    objective: 'Speak with Warden Sorrel',
    left: '4%',
    top: '10%',
    delay: '0.15s',
  },
  {
    title: 'Embers of Khaz Vel',
    type: 'fetch',
    typeClass: 'text-steel-400 border-steel-600',
    objective: 'Recover 3 ember shards',
    left: '36%',
    top: '40%',
    delay: '0.3s',
  },
  {
    title: 'Cinder Relics',
    type: 'side',
    typeClass: 'text-steel-400 border-steel-600',
    objective: 'Optional: appease the forge spirits',
    left: '10%',
    top: '64%',
    delay: '0.45s',
    mobileHidden: true,
  },
  {
    title: 'The Balrog Stirs',
    type: 'boss',
    typeClass: 'text-volt border-volt/40',
    objective: 'Survive the deep crossing',
    left: '68%',
    top: '8%',
    delay: '0.58s',
    selected: true,
    grounded: 'bestiary.md §4',
  },
];

function ViewportPanel() {
  return (
    <div className="lp-fade bg-steel-850 border border-steel-700 rounded-md overflow-hidden shadow-xl" style={{ animationDelay: '0.1s' }}>
      {/* Panel title bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-steel-900 border-b border-steel-700">
        <span className="font-hud text-[11px] text-steel-400 tracking-wider">
          questline_editor — emberfall_main.quest
        </span>
        <span className="font-hud text-[11px] text-steel-500">3/3 grounded</span>
      </div>

      {/* Canvas */}
      <div className="relative aspect-[3/2] lp-grid-bg" aria-hidden="true">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Curves run center-to-center; the opaque node cards mask the
              ends, so only the connecting arc in the gap is visible. */}
          <path
            d="M 19 21 C 32 21, 38 50, 51 50"
            className="lp-edge"
            style={{ animationDelay: '0.75s' }}
            fill="none"
            stroke="#55616e"
            strokeWidth="1.5"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 51 50 C 40 50, 25 54, 25 74"
            className="lp-edge hidden sm:block"
            style={{ animationDelay: '0.9s' }}
            fill="none"
            stroke="#55616e"
            strokeWidth="1.5"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 51 50 C 63 50, 70 21, 82 21"
            className="lp-edge"
            style={{ animationDelay: '1.05s' }}
            fill="none"
            stroke="#f5d90a"
            strokeWidth="1.5"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {NODES.map((node) => (
          <NodeCard key={node.title} node={node} />
        ))}
      </div>

      {/* Viewport status row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-steel-900 border-t border-steel-700 font-hud text-[11px] text-steel-500">
        <span>x:412 y:88</span>
        <span className="hidden sm:inline">4 nodes · 3 edges</span>
        <span>zoom 100%</span>
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: NodeSpec }) {
  return (
    <div
      className={`lp-node absolute w-36 sm:w-44 ${node.mobileHidden ? 'hidden sm:block' : ''}`}
      style={{ left: node.left, top: node.top, animationDelay: node.delay }}
    >
      <div
        className={`relative bg-steel-850 border rounded-md px-3 py-2.5 shadow-lg ${
          node.selected ? 'border-volt' : 'border-steel-700'
        }`}
      >
        {node.selected && (
          <>
            <CornerHandle className="-top-1 -left-1" />
            <CornerHandle className="-top-1 -right-1" />
            <CornerHandle className="-bottom-1 -left-1" />
            <CornerHandle className="-bottom-1 -right-1" />
          </>
        )}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`font-hud text-[9px] uppercase tracking-wider border rounded px-1 py-px ${node.typeClass}`}>
            {node.type}
          </span>
        </div>
        <p className="text-xs font-semibold text-steel-100 leading-snug">{node.title}</p>
        <p className="text-[10px] text-steel-400 leading-snug mt-0.5 truncate">{node.objective}</p>
        {node.grounded && (
          <p className="font-hud text-[9px] text-pulse mt-1.5 truncate">◈ {node.grounded}</p>
        )}
      </div>
    </div>
  );
}

function CornerHandle({ className }: { className: string }) {
  return <span className={`absolute w-2 h-2 bg-volt rounded-[1px] ${className}`} />;
}

/* ------------------------------------------------------------------ */
/* Feature panels                                                      */
/* ------------------------------------------------------------------ */

function FeaturePanels() {
  return (
    <section id="panels" className="border-b border-steel-800 scroll-mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <p className="font-hud text-xs text-pulse tracking-widest mb-3">{'// PANELS'}</p>
        <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight mb-10">
          The whole pipeline, docked.
        </h2>

        <div className="grid md:grid-cols-3 gap-5">
          <Panel label="kb_grounding" title="Your lore, embedded" icon={<BookOpen className="w-4 h-4 text-pulse" />}>
            <GroundingVis />
            <p className="text-sm text-steel-400 leading-relaxed mt-4">
              Upload design docs and bestiary pages. QuestFlow retrieves the right canon
              for every draft and cites the source on each generated line.
            </p>
          </Panel>

          <Panel label="sprite_lab" title="Every NPC gets a face" icon={<SpriteGlyph />}>
            <SpriteVis />
            <p className="text-sm text-steel-400 leading-relaxed mt-4">
              Generate pixel sprites for characters and items, then animate them
              frame by frame — without leaving the quest you're writing.
            </p>
          </Panel>

          <Panel label="export_dock" title="From graph to Git" icon={<GitBranch className="w-4 h-4 text-pulse" />}>
            <ExportVis />
            <p className="text-sm text-steel-400 leading-relaxed mt-4">
              Refine questlines on a node graph, then export JSON or push a branch
              straight to your game's repository.
            </p>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({
  label,
  title,
  icon,
  children,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-steel-900 border-b border-steel-700">
        <span className="font-hud text-[11px] text-steel-400 tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-base font-semibold text-steel-100 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function GroundingVis() {
  const chunks: Array<{ source: string; match: number }> = [
    { source: 'bestiary.md §4', match: 0.92 },
    { source: 'world_history.md §2', match: 0.87 },
    { source: 'factions.md §9', match: 0.71 },
  ];
  return (
    <div className="space-y-2" aria-hidden="true">
      {chunks.map((chunk) => (
        <div key={chunk.source} className="bg-steel-900 border border-steel-700 rounded px-2.5 py-1.5">
          <div className="flex items-center justify-between font-hud text-[10px] text-steel-400">
            <span className="truncate">{chunk.source}</span>
            <span className="text-pulse">{chunk.match.toFixed(2)}</span>
          </div>
          <div className="h-1 bg-steel-800 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-pulse rounded-full" style={{ width: `${chunk.match * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* A slime sprite rendered as one box-shadow per pixel — no image assets. */
const SLIME_PX = 6;
const SLIME_ROWS = [
  '....hbbb....',
  '...hbbbbb...',
  '..hbbbbbbd..',
  '.bbbbbbbbbd.',
  '.bbkbbbbkbd.',
  'bbbbbbbbbbdd',
  'bbbbbbbbbbdd',
  '.bbbbbbbbdd.',
  '..dddddddd..',
];
const SLIME_COLORS: Record<string, string> = {
  h: '#a9e9f1',
  b: '#57c7d4',
  d: '#3b98a6',
  k: '#111418',
};
const SLIME_SHADOW = SLIME_ROWS.flatMap((row, y) =>
  [...row].flatMap((ch, x) => {
    const color = SLIME_COLORS[ch];
    return color ? [`${x * SLIME_PX}px ${y * SLIME_PX}px 0 0 ${color}`] : [];
  }),
).join(', ');

function SpriteVis() {
  return (
    <div className="bg-steel-900 border border-steel-700 rounded px-3 py-3" aria-hidden="true">
      <div className="flex items-end justify-center h-16">
        <div className="lp-sprite-bob" style={{ width: SLIME_ROWS[0].length * SLIME_PX, height: SLIME_ROWS.length * SLIME_PX }}>
          <div style={{ width: SLIME_PX, height: SLIME_PX, boxShadow: SLIME_SHADOW }} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`w-2.5 h-2.5 rounded-[2px] border ${
                i === 2 ? 'bg-volt border-volt' : 'bg-steel-800 border-steel-600'
              }`}
            />
          ))}
        </div>
        <span className="font-hud text-[10px] text-steel-500">frame 03/06 · idle</span>
      </div>
    </div>
  );
}

function SpriteGlyph() {
  return (
    <span className="w-4 h-4 grid grid-cols-2 gap-px" aria-hidden="true">
      <span className="bg-pulse rounded-[1px]" />
      <span className="bg-steel-600 rounded-[1px]" />
      <span className="bg-steel-600 rounded-[1px]" />
      <span className="bg-pulse rounded-[1px]" />
    </span>
  );
}

function ExportVis() {
  return (
    <div className="bg-steel-900 border border-steel-700 rounded px-3 py-3 font-hud text-[11px] space-y-2" aria-hidden="true">
      <div className="flex items-center gap-2 text-steel-400">
        <GitBranch className="w-3.5 h-3.5 text-pulse" />
        <span className="truncate">quest/emberfall-main</span>
      </div>
      <div className="flex items-center gap-2 text-steel-500">
        <span className="w-1.5 h-1.5 rounded-full bg-volt shrink-0" />
        <span className="truncate">+ emberfall_main.quest.json</span>
      </div>
      <div className="flex items-center gap-2 text-steel-500">
        <span className="w-1.5 h-1.5 rounded-full bg-steel-600 shrink-0" />
        <span className="truncate">+ sprites/balrog_idle.png</span>
      </div>
      <div className="text-pulse pt-1">→ pushed to origin</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow strip — the pipeline is a real sequence, hence the numbers */
/* ------------------------------------------------------------------ */

const STEPS: Array<{ num: string; name: string; detail: string }> = [
  { num: '01', name: 'Ingest', detail: 'Feed lore docs into your game\'s knowledge base' },
  { num: '02', name: 'Generate', detail: 'Draft questlines grounded in that canon' },
  { num: '03', name: 'Refine', detail: 'Shape the story on the node graph editor' },
  { num: '04', name: 'Ship', detail: 'Export JSON or push straight to your repo' },
];

function WorkflowStrip() {
  return (
    <section id="workflow" className="border-b border-steel-800 scroll-mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
        <p className="font-hud text-xs text-pulse tracking-widest mb-3">{'// WORKFLOW'}</p>
        <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight mb-10">
          Lore in, questline out.
        </h2>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-steel-800 border border-steel-800 rounded-md overflow-hidden">
          {STEPS.map((step) => (
            <li key={step.num} className="bg-steel-900 p-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-hud text-xs text-volt">{step.num}</span>
                <span className="font-display font-semibold uppercase text-sm tracking-wide text-steel-100">
                  {step.name}
                </span>
              </div>
              <p className="text-sm text-steel-400 leading-relaxed">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CTA                                                                 */
/* ------------------------------------------------------------------ */

function CtaBand() {
  return (
    <section>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 text-center">
      <p className="font-hud text-xs text-steel-500 tracking-widest mb-3">{'// NEW QUEST AVAILABLE'}</p>
        <h2 className="font-display font-bold uppercase text-3xl sm:text-4xl tracking-tight mb-6">
          Start your first questline.
        </h2>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-volt text-steel-950 font-semibold text-sm rounded-md hover:brightness-95 transition-[filter] focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Start building
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 text-sm text-steel-100 border border-steel-600 rounded-md hover:bg-steel-800 transition-colors focus-visible:outline-2 focus-visible:outline-pulse"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
