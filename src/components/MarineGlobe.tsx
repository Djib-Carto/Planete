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

// WCMC GIS base URL — FeatureServer supports CORS for djib-carto.github.io natively
const WCMC_BASE = 'https://data-gis.unep-wcmc.org';

export default function MarineGlobe() {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);

    // Layer References
    const satelliteLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const wdpaLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const mangroveLayerRef = useRef<Cesium.ImageryLayer | null>(null);
    const bathyLayerRef = useRef<Cesium.ImageryLayer | null>(null);

    // Vector Datasources for high-fidelity glowing layers zoomed in
    const wdpaDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
    const mangroveDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
    const activeAbortControllerRef = useRef<AbortController | null>(null);

    const [selectedMpa, setSelectedMpa] = useState<MPAData | null>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [serviceStatus, setServiceStatus] = useState({
        wdpa: 'loading',
        gebco: 'active',
        mangrove: 'loading'
    });

    const [layers, setLayers] = useState({
        bathymetry: false,
        mpas: true,
        mangroves: true,
        imagery: true
    });

    // Store layers in ref so callbacks/handlers can read the latest values
    const layersRef = useRef(layers);
    useEffect(() => { layersRef.current = layers; }, [layers]);

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

    // Refresh WDPA and Mangrove vector data for the current camera BBOX.
    // Uses direct WCMC FeatureServer URLs.
    const refreshVectorData = async () => {
        if (!viewerRef.current || !isViewerReady) return;
        const viewer = viewerRef.current;
        const currentLayers = layersRef.current;

        const height = viewer.camera.positionCartographic.height;

        // Cancel any pending fetch requests
        if (activeAbortControllerRef.current) {
            activeAbortControllerRef.current.abort();
        }
        activeAbortControllerRef.current = new AbortController();
        const signal = activeAbortControllerRef.current.signal;

        const extent = viewer.camera.computeViewRectangle();
        if (!extent) return;

        const xmin = Cesium.Math.toDegrees(extent.west);
        const ymin = Cesium.Math.toDegrees(extent.south);
        const xmax = Cesium.Math.toDegrees(extent.east);
        const ymax = Cesium.Math.toDegrees(extent.north);
        const bbox = `${xmin},${ymin},${xmax},${ymax}`;

        // A. Aires Protégées WDPA — visible as vector < 2 000 km, otherwise as MapServer tiles
        if (currentLayers.mpas) {
            if (height < 2000000) {
                if (wdpaLayerRef.current) wdpaLayerRef.current.show = false;
                try {
                    const wdpaUrl = `${WCMC_BASE}/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/FeatureServer/1/query?` +
                        `geometry=${bbox}` +
                        `&geometryType=esriGeometryEnvelope` +
                        `&spatialRel=esriSpatialRelIntersects` +
                        `&outFields=*` +
                        `&inSR=4326&outSR=4326` +
                        `&f=geojson`;

                    const resp = await fetch(wdpaUrl, { signal });
                    const geojson = await resp.json();

                    if (!wdpaDataSourceRef.current) {
                        wdpaDataSourceRef.current = new Cesium.GeoJsonDataSource('WDPA-Vector');
                        viewer.dataSources.add(wdpaDataSourceRef.current);
                    }
                    
                    await wdpaDataSourceRef.current.load(geojson, { clampToGround: false });

                    // Golden glowing styling
                    const wdpaFill = Cesium.Color.fromCssColorString('#FFD700').withAlpha(0.25);
                    const entities = wdpaDataSourceRef.current.entities.values;
                    const newPolylines: Cesium.Entity[] = [];

                    for (const entity of entities) {
                        if (entity.polygon) {
                            entity.polygon.material = new Cesium.ColorMaterialProperty(wdpaFill) as any;
                            entity.polygon.outline = new Cesium.ConstantProperty(false);

                            const hierarchy = entity.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
                            if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
                                const positions = [...hierarchy.positions, hierarchy.positions[0]];
                                const glowBorder = new Cesium.Entity({
                                    name: entity.name,
                                    properties: entity.properties,
                                    polyline: {
                                        positions: positions,
                                        width: 4,
                                        material: new Cesium.PolylineGlowMaterialProperty({
                                            glowPower: 0.25,
                                            taperPower: 1.0,
                                            color: Cesium.Color.fromCssColorString('#FFD700')
                                        }),
                                        clampToGround: false
                                    }
                                });
                                newPolylines.push(glowBorder);
                            }
                        }
                    }
                    for (const poly of newPolylines) {
                        wdpaDataSourceRef.current.entities.add(poly);
                    }

                    wdpaDataSourceRef.current.show = true;
                } catch (e: any) {
                    if (e.name !== 'AbortError') {
                        console.warn('WDPA vector load skipped', e);
                    }
                }
            } else {
                if (wdpaLayerRef.current) wdpaLayerRef.current.show = true;
                if (wdpaDataSourceRef.current) wdpaDataSourceRef.current.show = false;
            }
        } else {
            if (wdpaLayerRef.current) wdpaLayerRef.current.show = false;
            if (wdpaDataSourceRef.current) wdpaDataSourceRef.current.show = false;
        }

        // B. Mangroves — visible as vector < 2 000 km with neon green glow, otherwise as MapServer tiles
        if (currentLayers.mangroves) {
            if (height < 2000000) {
                if (mangroveLayerRef.current) mangroveLayerRef.current.show = false;
                try {
                    const mangroveUrl = `${WCMC_BASE}/server/rest/services/HabitatsAndBiotopes/WCMC011_AtlasMangrove2010_v3/FeatureServer/0/query?` +
                        `geometry=${bbox}` +
                        `&geometryType=esriGeometryEnvelope` +
                        `&spatialRel=esriSpatialRelIntersects` +
                        `&outFields=*` +
                        `&inSR=4326&outSR=4326` +
                        `&f=geojson`;

                    const resp = await fetch(mangroveUrl, { signal });
                    const geojson = await resp.json();

                    if (!mangroveDataSourceRef.current) {
                        mangroveDataSourceRef.current = new Cesium.GeoJsonDataSource('Mangroves-Vector');
                        viewer.dataSources.add(mangroveDataSourceRef.current);
                    }

                    await mangroveDataSourceRef.current.load(geojson, { clampToGround: false });

                    // Glowing neon styling (vivid neon-green fill + glowing bright outline)
                    const mangroveFill = Cesium.Color.fromCssColorString('#39FF14').withAlpha(0.4);
                    const entities = mangroveDataSourceRef.current.entities.values;
                    const newPolylines: Cesium.Entity[] = [];

                    for (const entity of entities) {
                        if (entity.polygon) {
                            entity.polygon.material = new Cesium.ColorMaterialProperty(mangroveFill) as any;
                            entity.polygon.outline = new Cesium.ConstantProperty(false);

                            const hierarchy = entity.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
                            if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
                                const positions = [...hierarchy.positions, hierarchy.positions[0]];
                                const glowBorder = new Cesium.Entity({
                                    name: entity.name,
                                    properties: entity.properties,
                                    polyline: {
                                        positions: positions,
                                        width: 6,
                                        material: new Cesium.PolylineGlowMaterialProperty({
                                            glowPower: 0.35,
                                            taperPower: 1.0,
                                            color: Cesium.Color.fromCssColorString('#39FF14')
                                        }),
                                        clampToGround: false
                                    }
                                });
                                newPolylines.push(glowBorder);
                            }
                        }
                    }
                    for (const poly of newPolylines) {
                        mangroveDataSourceRef.current.entities.add(poly);
                    }

                    mangroveDataSourceRef.current.show = true;
                } catch (e: any) {
                    if (e.name !== 'AbortError') {
                        console.warn('Mangrove vector load skipped', e);
                    }
                }
            } else {
                if (mangroveLayerRef.current) mangroveLayerRef.current.show = true;
                if (mangroveDataSourceRef.current) mangroveDataSourceRef.current.show = false;
            }
        } else {
            if (mangroveLayerRef.current) mangroveLayerRef.current.show = false;
            if (mangroveDataSourceRef.current) mangroveDataSourceRef.current.show = false;
        }
    };

    // Effect for Imagery Layer Management (Satellite, WDPA, Mangroves, GEBCO)
    useEffect(() => {
        if (!viewerRef.current || !isViewerReady) return;
        const viewer = viewerRef.current;

        const connectServices = async () => {
            const layersCollection = viewer.imageryLayers;

            // 0. ESRI Satellite Imagery (BASE LAYER) — Esri public service, CORS OK
            if (!satelliteLayerRef.current) {
                try {
                    const imageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
                    );
                    satelliteLayerRef.current = layersCollection.addImageryProvider(imageryProvider, 0);
                } catch (e) {
                    console.error('Satellite Service Error', e);
                }
            }
            if (satelliteLayerRef.current) {
                satelliteLayerRef.current.show = layers.imagery;
            }

            // A. WDPA Protected Areas (ArcGIS MapServer — CORS OK)
            if (!wdpaLayerRef.current) {
                try {
                    const wdpaProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                        'https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/MapServer',
                        {
                            layers: '1'
                        }
                    );
                    wdpaLayerRef.current = layersCollection.addImageryProvider(wdpaProvider);
                    setServiceStatus(prev => ({ ...prev, wdpa: 'active' }));
                } catch (e) {
                    console.error('WDPA MapServer Error', e);
                    setServiceStatus(prev => ({ ...prev, wdpa: 'error' }));
                }
            }

            // B. Mangroves (ArcGIS MapServer — CORS OK)
            if (!mangroveLayerRef.current) {
                try {
                    const mangroveProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                        'https://data-gis.unep-wcmc.org/server/rest/services/HabitatsAndBiotopes/WCMC011_AtlasMangrove2010_v3/MapServer',
                        {
                            layers: '0'
                        }
                    );
                    mangroveLayerRef.current = layersCollection.addImageryProvider(mangroveProvider);
                    setServiceStatus(prev => ({ ...prev, mangrove: 'active' }));
                } catch (e) {
                    console.error('Mangrove MapServer Error', e);
                    setServiceStatus(prev => ({ ...prev, mangrove: 'error' }));
                }
            }

            // C. Bathymétrie GEBCO (WMS public — CORS OK)
            if (!bathyLayerRef.current) {
                try {
                    const gebcoProvider = new Cesium.WebMapServiceImageryProvider({
                        url: 'https://wms.gebco.net/mapserv',
                        layers: 'gebco_latest',
                        parameters: { transparent: 'true', format: 'image/png' }
                    });
                    bathyLayerRef.current = layersCollection.addImageryProvider(gebcoProvider);
                } catch (e) {
                    console.error('GEBCO Error', e);
                }
            }
            if (bathyLayerRef.current) {
                bathyLayerRef.current.show = layers.bathymetry;
                bathyLayerRef.current.alpha = 0.5;
            }

            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();

            // Load initial vector data and update on camera move
            viewer.camera.moveEnd.addEventListener(refreshVectorData);
            refreshVectorData();
        };

        connectServices();

        return () => {
            if (viewer) viewer.camera.moveEnd.removeEventListener(refreshVectorData);
        };
    }, [isViewerReady]);

    // React to layer toggle changes for visibility
    useEffect(() => {
        if (!viewerRef.current || !isViewerReady) return;

        if (satelliteLayerRef.current) {
            satelliteLayerRef.current.show = layers.imagery;
        }
        if (bathyLayerRef.current) {
            bathyLayerRef.current.show = layers.bathymetry;
        }
        
        // Refresh vector and raster layers reactively
        refreshVectorData();
    }, [layers, isViewerReady]);

    // Handle Direct Coordinate-Based Queries and Native Picking (ArcGIS FeatureServer/Entity Picking)
    useEffect(() => {
        if (!viewerRef.current || !isViewerReady) return;
        const viewer = viewerRef.current;
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction(async (movement: any) => {
            // Get clicked position on the ellipsoid
            const ray = viewer.camera.getPickRay(movement.position);
            if (!ray) return;
            const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
            if (!Cesium.defined(cartesian)) {
                setSelectedMpa(null);
                return;
            }

            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const longitude = Cesium.Math.toDegrees(cartographic.longitude);
            const latitude = Cesium.Math.toDegrees(cartographic.latitude);

            // 1. Try to pick native vector entities first (when zoomed in)
            const pickedObject = viewer.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Entity) {
                const entity = pickedObject.id;
                const props = entity.properties;

                const getValue = (key: string) => {
                    const prop = props?.[key];
                    if (prop && typeof prop.getValue === 'function') {
                        return prop.getValue(Cesium.JulianDate.now());
                    }
                    return null;
                };

                // Check if this entity or its outline is a Mangrove
                const isMangrove = entity.entityCollection?.owner?.name === 'Mangroves-Vector' || 
                                   entity.name?.includes('Mangroves') || 
                                   (props && props['WCMC011_AT'] !== undefined);

                if (isMangrove) {
                    const iso = getValue('parent_iso') || getValue('iso3') || 'DJI';
                    const countryName = iso === 'DJI' ? 'Djibouti' : (iso === 'ERI' ? 'Érythrée' : (iso === 'SOM' ? 'Somalie' : (iso === 'YEM' ? 'Yémen' : iso)));
                    const nameVal = getValue('orig_name') && getValue('orig_name') !== 'Not Reported' ? getValue('orig_name') : (getValue('name') && getValue('name') !== 'Not Reported' ? getValue('name') : `Mangroves (${countryName})`);
                    const gisArea = getValue('gis_area_k') && getValue('gis_area_k') !== 'Not Reported' ? getValue('gis_area_k') : (getValue('rep_area_k') && getValue('rep_area_k') !== 'Not Reported' ? getValue('rep_area_k') : 0);
                    const statusYear = getValue('start_date') && getValue('start_date') !== 'Not Reported' ? getValue('start_date') : (getValue('end_date') && getValue('end_date') !== 'Not Reported' ? getValue('end_date') : '2010');
                    const designation = getValue('data_type') && getValue('data_type') !== 'Not Reported' ? getValue('data_type') : 'Habitat de Mangrove';
                    const status = getValue('protect_st') && getValue('protect_st') !== 'Not Reported' ? getValue('protect_st') : (getValue('protect') === 2 ? 'Protégé (Statut National)' : 'Actif (Non Protégé)');
                    const govType = getValue('verif') && getValue('verif') !== 'Not Reported' ? getValue('verif') : 'Vérifié par l\'Institution';

                    setSelectedMpa({
                        properties: {
                            NAME: nameVal,
                            STATUS: status,
                            DESIG: designation,
                            IUCN_CAT: 'N/A',
                            REP_AREA: Number(gisArea) || 0,
                            STATUS_YR: statusYear,
                            GOV_TYPE: govType
                        }
                    });
                } else {
                    setSelectedMpa({
                        properties: {
                            NAME: getValue('ORIG_NAME') || getValue('NAME') || 'Indisponible',
                            STATUS: getValue('STATUS') || 'Désigné',
                            DESIG: getValue('DESIG_ENG') || getValue('DESIG') || 'Aire Protégée',
                            IUCN_CAT: getValue('IUCN_CAT') || 'Non Rapporté',
                            REP_AREA: getValue('REP_AREA') || getValue('REP_M_AREA') || 0,
                            STATUS_YR: getValue('STATUS_YR') || 'N/A',
                            GOV_TYPE: getValue('GOV_TYPE') || 'Gouvernance Locale/État'
                        }
                    });
                }

                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, viewer.camera.positionCartographic.height * 0.5),
                    duration: 1.5
                });
                return;
            }

            // 2. Fall back to coordinate queries (when zoomed out)
            // Fetch features from WDPA FeatureServer (Layer 1) using point geometry query if active
            if (layersRef.current.mpas) {
                try {
                    const wdpaUrl = `${WCMC_BASE}/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/FeatureServer/1/query?` +
                        `geometry=${longitude},${latitude}` +
                        `&geometryType=esriGeometryPoint` +
                        `&spatialRel=esriSpatialRelIntersects` +
                        `&outFields=*` +
                        `&inSR=4326&outSR=4326` +
                        `&f=geojson`;

                    const resp = await fetch(wdpaUrl);
                    const geojson = await resp.json();

                    if (geojson.features && geojson.features.length > 0) {
                        const feature = geojson.features[0];
                        const props = feature.properties;
                        
                        setSelectedMpa({
                            properties: {
                                NAME: props.ORIG_NAME || props.NAME || 'Indisponible',
                                STATUS: props.STATUS || 'Désigné',
                                DESIG: props.DESIG_ENG || props.DESIG || 'Aire Protégée',
                                IUCN_CAT: props.IUCN_CAT || 'Non Rapporté',
                                REP_AREA: props.REP_AREA || props.REP_M_AREA || 0,
                                STATUS_YR: props.STATUS_YR || 'N/A',
                                GOV_TYPE: props.GOV_TYPE || 'Gouvernance Locale/État'
                            }
                        });

                        viewer.camera.flyTo({
                            destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, viewer.camera.positionCartographic.height * 0.5),
                            duration: 1.5
                        });
                        return;
                    }
                } catch (e) {
                    console.error('WDPA point query failed', e);
                }
            }

            // Fetch features from Mangroves FeatureServer (Layer 0) using point geometry query if active
            if (layersRef.current.mangroves) {
                try {
                    const mangroveUrl = `${WCMC_BASE}/server/rest/services/HabitatsAndBiotopes/WCMC011_AtlasMangrove2010_v3/FeatureServer/0/query?` +
                        `geometry=${longitude},${latitude}` +
                        `&geometryType=esriGeometryPoint` +
                        `&spatialRel=esriSpatialRelIntersects` +
                        `&outFields=*` +
                        `&inSR=4326&outSR=4326` +
                        `&f=geojson`;

                    const resp = await fetch(mangroveUrl);
                    const geojson = await resp.json();

                    if (geojson.features && geojson.features.length > 0) {
                        const feature = geojson.features[0];
                        const props = feature.properties;

                        const iso = props.parent_iso || props.iso3 || 'DJI';
                        const countryName = iso === 'DJI' ? 'Djibouti' : (iso === 'ERI' ? 'Érythrée' : (iso === 'SOM' ? 'Somalie' : (iso === 'YEM' ? 'Yémen' : iso)));
                        const nameVal = props.orig_name && props.orig_name !== 'Not Reported' ? props.orig_name : (props.name && props.name !== 'Not Reported' ? props.name : `Mangroves (${countryName})`);
                        const gisArea = props.gis_area_k && props.gis_area_k !== 'Not Reported' ? props.gis_area_k : (props.rep_area_k && props.rep_area_k !== 'Not Reported' ? props.rep_area_k : 0);
                        const statusYear = props.start_date && props.start_date !== 'Not Reported' ? props.start_date : (props.end_date && props.end_date !== 'Not Reported' ? props.end_date : '2010');
                        const designation = props.data_type && props.data_type !== 'Not Reported' ? props.data_type : 'Habitat de Mangrove';
                        const status = props.protect_st && props.protect_st !== 'Not Reported' ? props.protect_st : (props.protect === 2 ? 'Protégé (Statut National)' : 'Actif (Non Protégé)');
                        const govType = props.verif && props.verif !== 'Not Reported' ? props.verif : 'Vérifié par l\'Institution';

                        setSelectedMpa({
                            properties: {
                                NAME: nameVal,
                                STATUS: status,
                                DESIG: designation,
                                IUCN_CAT: 'N/A',
                                REP_AREA: Number(gisArea) || 0,
                                STATUS_YR: statusYear,
                                GOV_TYPE: govType
                            }
                        });

                        viewer.camera.flyTo({
                            destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, viewer.camera.positionCartographic.height * 0.5),
                            duration: 1.5
                        });
                        return;
                    }
                } catch (e) {
                    console.error('Mangrove point query failed', e);
                }
            }

            setSelectedMpa(null);
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
                        Planète sous <span className="font-semibold text-teal-400 text-glow">Protection</span>
                    </h1>
                    <p className="text-[10px] tracking-[0.4em] uppercase text-white/40 mt-1">
                        Suivi des Écosystèmes et Aires Protégées
                    </p>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex gap-2">
                        {[
                             { id: 'wdpa', label: 'PNUE WDPA', status: (serviceStatus as any).wdpa },
                             { id: 'gebco', label: 'Grille GEBCO', status: serviceStatus.gebco },
                             { id: 'mangrove', label: 'Mangroves', status: serviceStatus.mangrove }
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

                    <div className="flex gap-1 ml-2">
                        <button
                            onClick={() => {
                                if (viewerRef.current) {
                                    viewerRef.current.camera.zoomIn(viewerRef.current.camera.positionCartographic.height * 0.3);
                                }
                            }}
                            className="bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-100 text-[14px] font-bold leading-none px-3 py-1.5 rounded-lg transition-all"
                            title="Zoomer"
                        >
                            +
                        </button>
                        <button
                            onClick={() => {
                                if (viewerRef.current) {
                                    viewerRef.current.camera.zoomOut(viewerRef.current.camera.positionCartographic.height * 0.3);
                                }
                            }}
                            className="bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-100 text-[14px] font-bold leading-none px-3 py-1.5 rounded-lg transition-all"
                            title="Dézoomer"
                        >
                            -
                        </button>
                    </div>
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

            {/* Attribution & Copyright */}
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
