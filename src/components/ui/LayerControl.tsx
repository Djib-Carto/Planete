import { Layers } from 'lucide-react';

interface LayerControlProps {
    layers: {
        bathymetry: boolean;
        mpas: boolean;
        mangroves: boolean;
        imagery: boolean;
    };
    toggleLayer: (key: 'bathymetry' | 'mpas' | 'mangroves' | 'imagery') => void;
}

export default function LayerControl({ layers, toggleLayer }: LayerControlProps) {
    const controls = [
        { key: 'imagery', label: 'Imagerie ESRI Satellite', icon: '🛰️' },
        { key: 'bathymetry', label: 'Profondeur Océanique', icon: '🌊' },
        { key: 'mpas', label: 'Aires Protégées (WDPA)', icon: '🛡️' },
        { key: 'mangroves', label: 'Flux Mangroves (WCMC)', icon: '🌿' },
    ] as const;

    return (
        <div className="absolute bottom-10 left-6 z-40 bg-black/60 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-2xl min-w-[220px]">
            <div className="flex items-center gap-3 mb-4 px-1">
                <Layers size={14} className="text-teal-400" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Exploration Scientifique</h3>
            </div>

            <div className="space-y-1">
                {controls.map((item) => (
                    <button
                        key={item.key}
                        onClick={() => toggleLayer(item.key)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all group ${layers[item.key]
                                ? 'bg-white/5 text-white border border-white/10'
                                : 'hover:bg-white/5 text-white/30 border border-transparent'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xs">{item.icon}</span>
                            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                        </div>
                        <div className={`w-1 h-1 rounded-full transition-all ${layers[item.key] ? 'bg-teal-400' : 'bg-white/10'
                            }`} />
                    </button>
                ))}
            </div>
        </div>
    );
}
