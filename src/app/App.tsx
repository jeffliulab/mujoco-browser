import { useEffect, useRef, useState } from 'react';
import { bootEmptyScene } from '../sim/empty_scene';
import { mountMujocoScene, type SceneHandle } from '../sim/mujoco_renderer';

type CanvasStatus = 'idle' | 'placeholder' | 'live' | 'booting-live' | 'error';

interface SceneSpec {
  label: string;
  url: string;
  assetBundleUrl?: string;
}

const AVAILABLE_SCENES: SceneSpec[] = [
  { label: 'simple.xml (2-body)', url: 'assets/scenes/simple.xml' },
  { label: 'humanoid.xml (complex)', url: 'assets/scenes/humanoid.xml' },
  {
    label: 'stretch_mj_3.3.0.xml (robot only)',
    url: 'assets/stretch/stretch_mj_3.3.0.xml',
    assetBundleUrl: 'assets/stretch',
  },
  {
    label: 'hospital_ward_min.xml (Phase 0F)',
    url: 'assets/stretch/hospital_ward_min.xml',
    assetBundleUrl: 'assets/stretch',
  },
];

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const placeholderDisposeRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<CanvasStatus>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [sceneInfo, setSceneInfo] = useState<{
    label: string;
    nbody: number;
    ngeom: number;
    ncam: number;
    wallMs: number;
  } | null>(null);
  const [cameraNames, setCameraNames] = useState<string[]>([]);
  const [activeCam, setActiveCam] = useState<string>('free');

  useEffect(() => {
    if (!canvasRef.current) return;
    setStatus('placeholder');
    bootEmptyScene(canvasRef.current)
      .then((d) => {
        placeholderDisposeRef.current = d;
      })
      .catch((e) => {
        setErr(String(e?.stack ?? e));
        setStatus('error');
      });
    return () => {
      if (placeholderDisposeRef.current) placeholderDisposeRef.current();
      placeholderDisposeRef.current = null;
      if (handleRef.current) handleRef.current.dispose();
      handleRef.current = null;
    };
  }, []);

  const loadScene = async (scene: SceneSpec) => {
    if (!canvasRef.current) return;
    setErr(null);
    setStatus('booting-live');

    // Tear down previous.
    if (placeholderDisposeRef.current) {
      placeholderDisposeRef.current();
      placeholderDisposeRef.current = null;
    }
    if (handleRef.current) {
      handleRef.current.dispose();
      handleRef.current = null;
    }

    const t0 = performance.now();
    try {
      const h = await mountMujocoScene(canvasRef.current, {
        sceneUrl: scene.url,
        assetBundleUrl: scene.assetBundleUrl,
        stepsPerFrame: 4,
      });
      handleRef.current = h;
      setSceneInfo({
        label: scene.label,
        nbody: h.nbody,
        ngeom: h.ngeom,
        ncam: h.ncam,
        wallMs: performance.now() - t0,
      });
      setCameraNames(h.cameraNames);
      setActiveCam('free');
      setStatus('live');
    } catch (e) {
      setErr(String((e as Error)?.stack ?? e));
      setStatus('error');
    }
  };

  const onCameraChange = (name: string) => {
    setActiveCam(name);
    handleRef.current?.setCamera(name);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={headerStyle}>
        <strong>Anima WASM Demo</strong>
        <span style={{ color: '#8a91a0' }}>
          canvas <code>{status}</code>
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {AVAILABLE_SCENES.map((s) => (
            <button
              key={s.url}
              onClick={() => loadScene(s)}
              disabled={status === 'booting-live'}
              style={btn}
            >
              Load {s.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', display: 'flex' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          {status === 'booting-live' && <Overlay text="Loading scene + seeding virtual FS…" />}
          {status === 'error' && err && <ErrorOverlay text={err} />}
          {status === 'live' && cameraNames.length > 1 && (
            <div style={camPickerStyle}>
              <span style={{ color: '#8a91a0', fontSize: 11, marginRight: 4 }}>camera</span>
              {cameraNames.map((n) => (
                <button
                  key={n}
                  onClick={() => onCameraChange(n)}
                  style={{
                    ...btn,
                    borderColor: n === activeCam ? '#5fb3ff' : '#2a3146',
                    color: n === activeCam ? '#5fb3ff' : '#e6e9ef',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside style={asideStyle}>
          <div style={{ color: '#8a91a0', marginBottom: 8 }}>Scene status</div>
          {!sceneInfo && status !== 'booting-live' && (
            <p style={{ color: '#8a91a0' }}>
              Click a scene button. The canvas currently shows the Phase 0C
              placeholder cube. Loading a scene will replace it with a live
              MuJoCo-driven render.
            </p>
          )}
          {sceneInfo && (
            <div>
              <Row k="scene" v={sceneInfo.label} />
              <Row k="nbody" v={String(sceneInfo.nbody)} />
              <Row k="ngeom" v={String(sceneInfo.ngeom)} />
              <Row k="ncam" v={String(sceneInfo.ncam)} />
              <Row k="boot wall" v={`${sceneInfo.wallMs.toFixed(0)} ms`} />
              <Row k="active cam" v={activeCam} />
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
      <span style={{ color: '#8a91a0', minWidth: 110 }}>{k}</span>
      <span style={{ wordBreak: 'break-all' }}>{v}</span>
    </div>
  );
}

function Overlay({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(11,13,18,0.7)',
        color: '#e6e9ef',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function ErrorOverlay({ text }: { text: string }) {
  return (
    <pre
      style={{
        position: 'absolute',
        inset: 16,
        background: '#1c0f12',
        color: '#f6a',
        padding: 12,
        overflow: 'auto',
        fontSize: 11,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </pre>
  );
}

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #1c2030',
  fontSize: 14,
  display: 'flex',
  gap: 20,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const asideStyle: React.CSSProperties = {
  width: 320,
  borderLeft: '1px solid #1c2030',
  padding: 14,
  overflow: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
};

const camPickerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  padding: 6,
  background: 'rgba(11,13,18,0.75)',
  border: '1px solid #1c2030',
  borderRadius: 4,
  flexWrap: 'wrap',
  maxWidth: 'calc(100% - 20px)',
};

const btn: React.CSSProperties = {
  background: '#1c2030',
  color: '#e6e9ef',
  border: '1px solid #2a3146',
  padding: '6px 10px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
};
