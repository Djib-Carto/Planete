import { X, Shield, Calendar, Ruler, Globe, Info } from 'lucide-react';

interface SidebarProps {
    mpa: {
        properties: {
            NAME: string;
            STATUS: string;
            DESIG: string;
            IUCN_CAT: string;
            REP_AREA: number;
            STATUS_YR: number | string;
            GOV_TYPE: string;
        };
    };
    onClose: () => void;
}

export default function Sidebar({ mpa, onClose }: SidebarProps) {
    const { properties } = mpa;

    const sections = [
        { label: 'Status', value: properties.STATUS, icon: Shield, color: 'text-teal-400' },
        { label: 'Designation', value: properties.DESIG, icon: Info, color: 'text-sky-400' },
        { label: 'IUCN Category', value: properties.IUCN_CAT, icon: Globe, color: 'text-indigo-400' },
        { label: 'Reported Area', value: `${Number(properties.REP_AREA).toLocaleString()} km²`, icon: Ruler, color: 'text-emerald-400' },
        { label: 'Status Year', value: properties.STATUS_YR, icon: Calendar, color: 'text-amber-400' },
    ];

    return (
        <div className="absolute top-6 right-6 bottom-6 w-96 z-40 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-all animate-in fade-in slide-in-from-right-8 duration-500">
            {/* Header */}
            <div className="p-8 bg-gradient-to-b from-teal-500/10 to-transparent">
                <div className="flex justify-between items-start mb-6">
                    <span className="px-3 py-1 bg-teal-500/20 text-teal-300 text-[10px] font-bold uppercase tracking-wider rounded-full border border-teal-500/30">
                        Official WDPA Record
                    </span>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
                <h2 className="text-2xl font-light text-white leading-tight">
                    {properties.NAME}
                </h2>
                <div className="mt-4 flex items-center gap-2 text-white/40 text-[11px] uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                    Verified Institution Data
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid gap-6">
                    {sections.map((section) => (
                        <div key={section.label} className="group flex items-start gap-4">
                            <div className={`p-2 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors ${section.color}`}>
                                <section.icon size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1">
                                    {section.label}
                                </p>
                                <p className="text-white/80 font-medium group-hover:text-white transition-colors">
                                    {section.value || 'Not Reported'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-8 border-t border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-4">Governance Type</p>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-teal-100/70 text-sm italic leading-relaxed">
                            {properties.GOV_TYPE || 'Standard International Protection Protocol'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-8 bg-white/5 border-t border-white/5 flex gap-3">
                <button className="flex-1 py-4 bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg shadow-teal-500/20">
                    Spatial Report
                </button>
                <button className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all">
                    WDPA
                </button>
            </div>
        </div>
    );
}
