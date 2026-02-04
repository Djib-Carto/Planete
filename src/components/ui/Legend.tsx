export default function Legend() {
    return (
        <div className="absolute bottom-10 right-8 bg-black/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 z-40 text-white shadow-2xl w-72 transition-all">
            <div className="flex flex-col gap-6">
                <div>
                    <h4 className="text-[9px] uppercase tracking-[0.2em] text-teal-400 mb-3 font-bold opacity-80">
                        Profondeur Bathymétrique (GEBCO)
                    </h4>
                    <div className="flex flex-col gap-2">
                        <div className="w-full h-2 rounded-full bg-gradient-to-r from-[#e0f7fa] via-[#0288d1] to-[#011627] border border-white/5"></div>
                        <div className="flex justify-between text-[8px] text-white/40 tracking-wider font-medium">
                            <span>Plateau Côtier</span>
                            <span>Fosse Abyssale</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
