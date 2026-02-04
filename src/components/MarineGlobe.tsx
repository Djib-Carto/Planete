import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Sidebar from './ui/Sidebar';
import LayerControl from './ui/LayerControl';
import Legend from './ui/Legend';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

// Set Cesium base URL for assets
(window as any).CESIUM_BASE_URL = '/Planete/cesium';

// Interface for Authoritative MPA metadata
interface MPAData {
    properties: Record<string, any>;
}

const getApiUrl = (base: string, path: string) => {
    const isProd = import.meta.env.PROD;
    if (isProd) {
        // Use a public CORS proxy for GitHub Pages deployment
        return `https://corsproxy.io/?${encodeURIComponent('https://data-gis.unep-wcmc.org' + path)}`;
    }
    return base + path;
};

export default function MarineGlobe() {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);

    // Layer References
    const wdpaLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const wdpaDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
    const mangroveLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const bathyLayerRef = useRef<Cesium.ImageryLayer | null>(null);

    const [selectedMpa, setSelectedMpa] = useState<MPAData | null>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [serviceStatus, setServiceStatus] = useState({
        wdpa: 'loading',
        gebco: 'active'
    });

    const [layers, setLayers] = useState({
        bathymetry: false, // Default off to see imagery better
        mpas: true,
        mangroves: true,
        imagery: true
    });

    useEffect(() => {
        if (!containerRef.current) return;

        // 1. Initialize Viewer with ultra-clean institutional settings
        const viewer = new Cesium.Viewer(containerRef.current, {
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            sceneModePicker: false,
            selectionIndicator: false,
            timeline: false,
            animation: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            skyAtmosphere: false,
            shouldAnimate: false,
            baseLayer: false,
            contextOptions: {
                webgl: { preserveDrawingBuffer: true }
            }
        });

        viewerRef.current = viewer;

        // 2. Configure High-Fidelity Rendering
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = false;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#000814');

        // Initial camera position (Global View)
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(-150, 10, 18000000),
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(-90),
                roll: 0
            }
        });

        setIsViewerReady(true);

        return () => {
            if (viewer && !viewer.isDestroyed()) {
                viewer.destroy();
            }
            viewerRef.current = null;
        };
    }, []);

    // Function high-performance pour charger les données vectorielles par BBOX
    const refreshVectorData = async () => {
        if (!viewerRef.current || !layers.mpas) return;
        const viewer = viewerRef.current;

        // Calculer l'étendue actuelle de la vue
        const extent = viewer.camera.computeViewRectangle();
        if (!extent) return;

        // Limiter la charge : ne charger les vecteurs que si on est assez proche du sol
        if (viewer.camera.positionCartographic.height > 6000000) {
            if (wdpaDataSourceRef.current) wdpaDataSourceRef.current.show = false;
            return;
        }

        const xmin = Cesium.Math.toDegrees(extent.west);
        const ymin = Cesium.Math.toDegrees(extent.south);
        const xmax = Cesium.Math.toDegrees(extent.east);
        const ymax = Cesium.Math.toDegrees(extent.north);

        try {
            // Requête Spatiale Optimisée : On ne récupère que ce qui est visible
            const queryPath = `/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/FeatureServer/1/query?` +
                `geometry=${xmin},${ymin},${xmax},${ymax}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson`;

            const geojsonUrl = getApiUrl('/wdpa-api', queryPath);

            if (!wdpaDataSourceRef.current) {
                wdpaDataSourceRef.current = new Cesium.GeoJsonDataSource("WDPA-Vector");
                viewer.dataSources.add(wdpaDataSourceRef.current);
            }

            await wdpaDataSourceRef.current.load(geojsonUrl, {
                stroke: Cesium.Color.fromCssColorString('#f59e0b'), // Ambre/Orange
                fill: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.3),
                strokeWidth: 2,
                clampToGround: true
            });

            wdpaDataSourceRef.current.show = true;
            setServiceStatus(prev => ({ ...prev, wdpa: 'active' }));
        } catch (e) {
            console.warn("BBOX Vector load skipped", e);
        }
    };

    // Effect for Authoritative Layer Management
    useEffect(() => {
        if (!viewerRef.current || !isViewerReady) return;
        const viewer = viewerRef.current;

        const connectServices = async () => {
            // 0. ESRI Satellite Imagery (BASE LAYER)
            const layersCollection = viewer.imageryLayers;
            const imageryCount = layersCollection.length;

            // Check if we already have the imagery layer added
            let esaImagery = null;
            for (let i = 0; i < imageryCount; i++) {
                const l = layersCollection.get(i);
                if (l.imageryProvider instanceof Cesium.ArcGisMapServerImageryProvider && l.imageryProvider.url.includes('World_Imagery')) {
                    esaImagery = l;
                    break;
                }
            }

            if (!esaImagery) {
                try {
                    const imageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
                    );
                    esaImagery = layersCollection.addImageryProvider(imageryProvider, 0); // Always bottom
                } catch (e) {
                    console.error("Satellite Service Error");
                }
            }
            if (esaImagery) esaImagery.show = layers.imagery;

            // A. Bathymétrie (Official GEBCO Global WMS)
            if (!bathyLayerRef.current) {
                try {
                    const gebcoProvider = new Cesium.WebMapServiceImageryProvider({
                        url: 'https://wms.gebco.net/mapserv',
                        layers: 'gebco_latest',
                        parameters: { transparent: 'true', format: 'image/png' }
                    });
                    bathyLayerRef.current = layersCollection.addImageryProvider(gebcoProvider);
                } catch (e) {
                    console.error("GEBCO Error", e);
                }
            }
            if (bathyLayerRef.current) {
                bathyLayerRef.current.show = layers.bathymetry;
                bathyLayerRef.current.alpha = 0.5;
            }

            // B. Visual WDPA (Imagery - Ambre/Or)
            if (!wdpaLayerRef.current) {
                try {
                    const wdpaUrl = getApiUrl('/wdpa-api', '/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/MapServer');
                    const wdpaImagery = await Cesium.ArcGisMapServerImageryProvider.fromUrl(wdpaUrl);
                    wdpaLayerRef.current = layersCollection.addImageryProvider(wdpaImagery);
                    wdpaLayerRef.current.alpha = 0.8;
                } catch (e) {
                    console.error("WDPA Imagery Error", e);
                }
            }
            if (wdpaLayerRef.current) wdpaLayerRef.current.show = layers.mpas;

            // C. Mangroves (Vert Émeraude - BOOST DE LISIBILITÉ)
            if (!mangroveLayerRef.current) {
                try {
                    const mangroveUrl = getApiUrl('/habitats-api', '/server/rest/services/HabitatsAndBiotopes/WCMC011_AtlasMangrove2010_v3/MapServer');
                    const mangroveImagery = await Cesium.ArcGisMapServerImageryProvider.fromUrl(mangroveUrl);
                    mangroveLayerRef.current = layersCollection.addImageryProvider(mangroveImagery);
                    mangroveLayerRef.current.alpha = 1.0;
                    mangroveLayerRef.current.brightness = 2.5; // Très brillant
                    mangroveLayerRef.current.contrast = 1.5;   // Tranchant
                } catch (e) {
                    console.error("Mangrove Error", e);
                }
            }
            if (mangroveLayerRef.current) {
                mangroveLayerRef.current.show = layers.mangroves;
                // S'assurer que les mangroves sont au-dessus pour être vues
                layersCollection.raiseToTop(mangroveLayerRef.current);
            }

            viewer.camera.moveEnd.addEventListener(refreshVectorData);
            refreshVectorData();
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        };

        connectServices();

        return () => {
            if (viewer) viewer.camera.moveEnd.removeEventListener(refreshVectorData);
        };
    }, [layers, isViewerReady]);

    // Handle Direct Vector Interactions (GeoJSON Picking)
    useEffect(() => {
        if (!viewerRef.current || !isViewerReady) return;
        const viewer = viewerRef.current;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((movement: any) => {
            // Pick vector entities instead of imagery features
            const pickedObject = viewer.scene.pick(movement.position);

            if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Entity) {
                const entity = pickedObject.id;
                const props = entity.properties;

                // Helper to extract properties from the GeoJSON entity attributes
                const getValue = (key: string) => {
                    const prop = props?.[key];
                    if (prop && typeof prop.getValue === 'function') {
                        return prop.getValue(Cesium.JulianDate.now());
                    }
                    return 'N/A';
                };

                setSelectedMpa({
                    properties: {
                        NAME: getValue('ORIG_NAME') || getValue('NAME') || 'Indisponible',
                        STATUS: getValue('STATUS') || 'Désigné',
                        DESIG: getValue('DESIG_ENG') || getValue('DESIG') || 'Aire Protégée',
                        IUCN_CAT: getValue('IUCN_CAT') || 'Non Rapporté',
                        REP_AREA: getValue('REP_AREA') || 0,
                        STATUS_YR: getValue('STATUS_YR') || 'N/A',
                        GOV_TYPE: getValue('GOV_TYPE') || 'Gouvernance Locale/État'
                    }
                });

                // High-performance cinematic fly-to
                viewer.flyTo(entity, {
                    duration: 1.5,
                    offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_FOUR, 1000000)
                });
            } else {
                setSelectedMpa(null);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => handler.destroy();
    }, [isViewerReady]);

    return (
        <div className="relative w-full h-full font-sans antialiased text-slate-100 selection:bg-teal-500/30">
            {/* Globe Viewport */}
            <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#00040a]" />

            {/* Top Navigation & Status Bar */}
            <div className="absolute top-6 left-6 z-40 flex flex-col gap-4">
                <div className="pointer-events-none mb-2">
                    <h1 className="text-3xl font-light tracking-[0.3em] uppercase text-white/90">
                        Planète sous <span className="font-semibold text-teal-400 text-glow"> Protection</span>
                    </h1>
                    <p className="text-[10px] tracking-[0.4em] uppercase text-white/40 mt-1">
                        Suivi des Écosystèmes et Aires Protégées
                    </p>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex gap-2">
                        {[
                            { id: 'wdpa', label: 'PNUE WDPA', status: serviceStatus.wdpa },
                            { id: 'gebco', label: 'Grille GEBCO', status: serviceStatus.gebco }
                        ].map(s => (
                            <div key={s.id} className="flex items-center gap-2 bg-black/40 border border-white/5 backdrop-blur-md px-3 py-1.5 rounded-lg">
                                {s.status === 'loading' && <Loader2 size={10} className="animate-spin text-slate-500" />}
                                {s.status === 'active' && <CheckCircle2 size={10} className="text-teal-500" />}
                                {s.status === 'error' && <AlertCircle size={10} className="text-rose-500" />}
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{s.label}</span>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => {
                            if (viewerRef.current) {
                                viewerRef.current.camera.flyTo({
                                    destination: Cesium.Cartesian3.fromDegrees(43.15, 11.5, 300000), // Djibouti
                                    duration: 3
                                });
                            }
                        }}
                        className="bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-100 text-[10px] font-bold uppercase tracking-tighter px-4 py-1.5 rounded-lg transition-all"
                    >
                        Focus sur Djibouti
                    </button>
                </div>
            </div>

            <LayerControl
                layers={layers}
                toggleLayer={(key: 'bathymetry' | 'mpas' | 'mangroves' | 'imagery') => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
            />

            {selectedMpa && (
                <Sidebar mpa={selectedMpa as any} onClose={() => setSelectedMpa(null)} />
            )}

            <Legend />

            {/* Attribution & Copyright - Positioned at extreme bottom to avoid overlap */}
            <div className="absolute bottom-2 right-8 z-40 pointer-events-none text-right">
                <p className="text-[9px] tracking-[0.4em] uppercase text-white/30 font-medium">
                    ©Moustapha Farah 2026 • Flux WDPA/GEBCO/WCMC
                </p>
            </div>

            {!isViewerReady && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#01060e]">
                    <div className="text-center">
                        <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto mb-6 opacity-40" />
                        <div className="text-[10px] tracking-[0.5em] uppercase text-white/40 font-light">
                            Synthesizing Virtual Ocean Engine
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
