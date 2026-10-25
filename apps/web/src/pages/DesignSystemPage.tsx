import React, { useState } from 'react';
import {
  Button,
  Input,
  Field,
  Switch,
  SegmentedControl,
  Slider,
  Badge,
  Avatar,
  Tooltip,
  Skeleton,
  EmptyState,
  CodeInput,
  Dropzone,
  PillLink,
} from '../components/ui';
import { GlassSurface } from '../components/GlassSurface';
import { Film, Play, Volume2, Shield, AlertTriangle } from 'lucide-react';

export const DesignSystemPage: React.FC = () => {
  const [activeBg, setActiveBg] = useState<'ambient' | 'bright' | 'dark'>('ambient');
  const [switchVal, setSwitchVal] = useState(true);
  const [segVal, setSegVal] = useState('call');
  const [sliderVal, setSliderVal] = useState(45);
  const [inputText, setInputText] = useState('Sample input text');
  const [codeVal, setCodeVal] = useState('ABC123');

  const bgStyles = {
    ambient: 'bg-[#09090b]',
    bright: 'bg-gradient-to-tr from-amber-100 via-orange-200 to-sky-200 text-slate-900',
    dark: 'bg-gradient-to-b from-[#0a0c14] to-[#040508] text-slate-100',
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 p-8 ${bgStyles[activeBg]}`}>
      {/* Background Mode Selector */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cineva Design System</h1>
          <p className="text-sm opacity-60 mt-1">
            Living style guide rendering atomic components across simulated ambient and video surfaces.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium opacity-60 mr-2">Test Backdrop:</span>
          <Button
            size="small"
            variant={activeBg === 'ambient' ? 'primary' : 'secondary'}
            onClick={() => setActiveBg('ambient')}
          >
            Ambient Dark
          </Button>
          <Button
            size="small"
            variant={activeBg === 'bright' ? 'primary' : 'secondary'}
            onClick={() => setActiveBg('bright')}
          >
            Bright Video
          </Button>
          <Button
            size="small"
            variant={activeBg === 'dark' ? 'primary' : 'secondary'}
            onClick={() => setActiveBg('dark')}
          >
            Dark Video
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-12">
        {/* Glass Surface Primitives */}
        <section>
          <h2 className="text-lg font-medium mb-4">1. Glass Surface Primitives</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassSurface level="thin" className="p-6 rounded-2xl">
              <h3 className="text-sm font-semibold mb-1">Thin Glass</h3>
              <p className="text-xs opacity-70">
                rgba(30,30,36,0.38) · 20px blur · Used for subtle overlays and pills.
              </p>
            </GlassSurface>

            <GlassSurface level="regular" className="p-6 rounded-2xl">
              <h3 className="text-sm font-semibold mb-1">Regular Glass</h3>
              <p className="text-xs opacity-70">
                rgba(30,30,36,0.52) · 32px blur · Standard floating panels, docks, and bars.
              </p>
            </GlassSurface>

            <GlassSurface level="thick" className="p-6 rounded-2xl">
              <h3 className="text-sm font-semibold mb-1">Thick Glass</h3>
              <p className="text-xs opacity-70">
                rgba(30,30,36,0.72) · 44px blur · Modals, popovers, and bottom sheets.
              </p>
            </GlassSurface>
          </div>
        </section>

        {/* Buttons */}
        <section>
          <h2 className="text-lg font-medium mb-4">2. Buttons (States & Variants)</h2>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" loading>
                Loading
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="small" variant="primary">Small</Button>
              <Button size="normal" variant="primary">Normal</Button>
              <Button size="large" variant="primary">Large</Button>
              <Button variant="icon" icon={<Play className="w-4 h-4" />} aria-label="Play" />
              <Button variant="icon" size="small" icon={<Volume2 className="w-3.5 h-3.5" />} aria-label="Volume" />
            </div>
          </div>
        </section>

        {/* Controls & Inputs */}
        <section>
          <h2 className="text-lg font-medium mb-4">3. Inputs & Form Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <Field label="Text Input" hint="Sentence case placeholder">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Enter value..."
                />
              </Field>

              <Field label="Input with Error" error="This field is required.">
                <Input defaultValue="" hasError placeholder="Required field..." />
              </Field>

              <div>
                <label className="block text-xs font-medium opacity-70 mb-2">6-Digit Code Input</label>
                <CodeInput value={codeVal} onChange={setCodeVal} />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium opacity-70 mb-2">Switch Toggle</label>
                <Switch
                  label="Guests can play, pause and skip"
                  hint="Allow all room participants to control video playback"
                  checked={switchVal}
                  onChange={setSwitchVal}
                />
              </div>

              <div>
                <label className="block text-xs font-medium opacity-70 mb-2">Segmented Control</label>
                <SegmentedControl
                  value={segVal}
                  onChange={setSegVal}
                  options={[
                    { value: 'call', label: 'Call' },
                    { value: 'chat', label: 'Chat' },
                    { value: 'people', label: 'People (3)' },
                  ]}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium opacity-70 mb-2">
                  <span>Range Slider</span>
                  <span>{sliderVal}%</span>
                </div>
                <Slider value={sliderVal} onChange={setSliderVal} />
              </div>
            </div>
          </div>
        </section>

        {/* Status, Badges & Avatars */}
        <section>
          <h2 className="text-lg font-medium mb-4">4. Badges, Avatars & Tooltips</h2>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Badge variant="neutral">Host</Badge>
              <Badge variant="success">In sync</Badge>
              <Badge variant="warning">Buffering</Badge>
              <Badge variant="danger">Disconnected</Badge>
            </div>

            <div className="flex items-center gap-3">
              <Avatar name="Abbas Ahamed" size="small" />
              <Avatar name="Sarah Connor" size="normal" isSpeaking />
              <Avatar name="John Doe" size="large" />
            </div>

            <Tooltip content="Keyboard shortcut: Space or K">
              <Button variant="secondary" size="small">
                Hover for Tooltip
              </Button>
            </Tooltip>
          </div>
        </section>

        {/* Empty States & Skeletons */}
        <section>
          <h2 className="text-lg font-medium mb-4">5. Empty States & Skeletons</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EmptyState
              icon={<Film className="w-8 h-8" />}
              title="No movie selected"
              description="Drop an MP4, MKV, or WebM video file to start watching together."
              action={<Button size="small">Choose Video</Button>}
            />

            <div className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </section>

        {/* Dropzone & File Upload */}
        <section>
          <h2 className="text-lg font-medium mb-4">6. Dropzone</h2>
          <Dropzone onFileSelected={(f: File) => console.log('File:', f.name)} />
        </section>
      </div>
    </div>
  );
};
