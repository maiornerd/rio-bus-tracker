/**
 * RIO BUS TRACKER - Frontend Architecture
 * Author: Senior Full Stack Engineer
 */

// ==========================================
// 1. DATA LAYER (Mock & API Integration)
// ==========================================
class TransitDataService {
    constructor() {
        this.useRealAPI = false; // Mude para true quando ligar o backend
        this.apiEndpoint = 'http://127.0.0.1:8000/api/onibus'; 
        
        // Agora o banco de rotas começa vazio!
        this.routesDB = {}; 
        this.mockBusState = { progress: 0, line: null };
    }

    // NOVO MÉTODO: Busca o arquivo JSON estático
    async loadRoutes() {
        try {
            const response = await fetch('./data/rotas_extraidas.json');
            if (!response.ok) throw new Error('Falha ao carregar a malha viária.');
            
            this.routesDB = await response.json();
            console.log('✅ Rotas GTFS carregadas com sucesso:', Object.keys(this.routesDB).length, 'linhas disponíveis.');
        } catch (error) {
            console.error('Erro ao ler o JSON de rotas:', error);
        }
    }

    searchLines(query) {
        query = query.toUpperCase();
        return Object.keys(this.routesDB).filter(line => line.includes(query) || this.routesDB[line].dest.toUpperCase().includes(query));
    }

    getRouteData(lineCode) {
        return this.routesDB[lineCode.toUpperCase()];
    }

    // Retorna a posição do ônibus (Real ou Simulado)
    async getRealTimeBusLocation(lineCode) {
        this.useRealAPI = true; // ATIVANDO A PRODUÇÃO!
        
        try {
            const response = await fetch(`http://127.0.0.1:8000/api/onibus/${lineCode}`);
            if (!response.ok) return []; // Retorna vazio se der erro ou não tiver ônibus
            
            const data = await response.json();
            return data.veiculos; // Agora retorna um array com a frota inteira!
        } catch(e) { 
            console.error("Falha na API:", e);
            return [];
        }
    }
}

// ==========================================
// 2. UI & MAP CONTROLLER
// ==========================================
class AppController {
    constructor() {
        this.dataService = new TransitDataService();
        this.map = null;
        this.busMarker = {}; // Agora é um objeto para suportar múltiplos ônibus
        this.routeLayer = null;
        this.stopMarkers = [];
        this.pollingInterval = null;
        this.currentLine = null;

        // Chama a nova rotina de inicialização assíncrona
        this.bootstrapApp(); 
    }

    // NOVA ROTINA: Prepara os dados antes de liberar a tela
    async bootstrapApp() {
        const searchInput = document.getElementById('bus-search');
        
        // Desabilita o input e avisa o usuário
        searchInput.disabled = true;
        searchInput.placeholder = "Carregando malha viária do Rio...";

        // Espera o fetch() terminar
        await this.dataService.loadRoutes();

        // Libera o input para uso
        searchInput.disabled = false;
        searchInput.placeholder = "Buscar linha (ex: 474, 107)...";

        // Inicializa o resto da interface
        this.initMap();
        this.bindEvents();
        this.initTheme();
    }

    initMap() {
        // Inicializa mapa focado no Centro do Rio de Janeiro
        this.map = L.map('map', { zoomControl: false }).setView([-22.9068, -43.1729], 12);
        
        // Tiles do OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    }

    bindEvents() {
        const searchInput = document.getElementById('bus-search');
        const resultsList = document.getElementById('autocomplete-results');
        const themeToggle = document.getElementById('theme-toggle');

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            resultsList.innerHTML = '';
            if (query.length < 2) {
                resultsList.classList.add('hidden');
                return;
            }

            const results = this.dataService.searchLines(query);
            if (results.length > 0) {
                resultsList.classList.remove('hidden');
                results.forEach(line => {
                    const li = document.createElement('li');
                    li.textContent = `${line} - ${this.dataService.getRouteData(line).dest}`;
                    li.onclick = () => {
                        searchInput.value = line;
                        resultsList.classList.add('hidden');
                        this.selectLine(line);
                    };
                    resultsList.appendChild(li);
                });
            }
        });

        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
        });
    }

    initTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    async selectLine(lineCode) {
        this.currentLine = lineCode;
        const route = this.dataService.getRouteData(lineCode);
        
        // UI Updates
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('loading-indicator').classList.remove('hidden');
        document.getElementById('info-panel').classList.add('hidden');

        this.clearMap();

        // Desenhar Trajeto
        this.routeLayer = L.polyline(route.path, { color: 'var(--primary)', weight: 5, opacity: 0.7 }).addTo(this.map);
        this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });

        // Desenhar Paradas
        route.stops.forEach(stop => {
            const marker = L.circleMarker([stop.lat, stop.lng], {
                radius: 6, fillColor: '#ffffff', color: 'var(--primary)', weight: 2, fillOpacity: 1
            }).addTo(this.map).bindPopup(stop.name);
            this.stopMarkers.push(marker);
        });

        // Preencher Painel UI
        document.getElementById('bus-line').textContent = route.name;
        document.getElementById('bus-destination').textContent = route.dest;
        
        const stopsList = document.getElementById('stops-list');
        stopsList.innerHTML = '';
        route.stops.forEach(stop => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${stop.name}</strong> <br> <small class="text-muted">ETA: ${stop.etaMinutes} min</small>`;
            stopsList.appendChild(li);
        });

        this.startRealTimeTracking();
    }

    async startRealTimeTracking() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);

        // Atualização a cada 3 segundos para suavidade na demonstração
        this.pollingInterval = setInterval(() => this.updateBusPosition(), 3000);
        await this.updateBusPosition(); // Primeira chamada imediata

        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('info-panel').classList.remove('hidden');
    }

    async updateBusPosition() {
        if (!this.currentLine) return;
        
        // Busca a frota no backend Python
        const frota = await this.dataService.getRealTimeBusLocation(this.currentLine);
        
        const statusBadge = document.getElementById('bus-status');
        if (frota.length === 0) {
            statusBadge.textContent = "Nenhum veículo ativo";
            statusBadge.style.backgroundColor = "var(--text-muted)";
            return;
        }

        // Atualiza a UI
        statusBadge.textContent = `${frota.length} em operação`;
        statusBadge.style.backgroundColor = "var(--success)";
        document.getElementById('bus-speed').textContent = `${frota[0].speed} (carro líder)`;
        document.getElementById('bus-last-update').textContent = frota[0].timestamp;

        const idsAtivos = new Set(frota.map(b => b.ordem));

        // Rastreia e move os ônibus
        frota.forEach(bus => {
            // Desenho do marcador com a velocidade impressa dentro dele!
            const busIcon = L.divIcon({
                html: `<div style="background-color: var(--primary); color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); font-size: 11px; font-weight: bold;">${bus.speed}</div>`,
                className: '', iconSize: [30, 30], iconAnchor: [15, 15]
            });

            const popupContent = `<b>Carro:</b> ${bus.ordem}<br><b>Velocidade:</b> ${bus.speed} km/h<br><b>Visto em:</b> ${bus.timestamp}`;

            if (!this.busMarkers[bus.ordem]) {
                // Ônibus novo no radar: cria o marcador
                const marker = L.marker([bus.lat, bus.lng], { icon: busIcon })
                                .bindPopup(popupContent)
                                .addTo(this.map);
                this.busMarkers[bus.ordem] = marker;
            } else {
                // Ônibus já existe: desliza ele suavemente pelo mapa
                const marker = this.busMarkers[bus.ordem];
                marker.setLatLng([bus.lat, bus.lng]);
                marker.setIcon(busIcon);
                marker.getPopup().setContent(popupContent);
            }
        });

        // Limpeza: remove do mapa os ônibus que desligaram o motor/GPS
        Object.keys(this.busMarkers).forEach(ordemId => {
            if (!idsAtivos.has(ordemId)) {
                this.map.removeLayer(this.busMarkers[ordemId]);
                delete this.busMarkers[ordemId];
            }
        });
    }

    clearMap() {
        // 1. Removemos TODOS os ônibus atuais do mapa (Nova lógica)
        if (this.busMarkers) {
            Object.values(this.busMarkers).forEach(m => this.map.removeLayer(m));
        }
        
        // Mantemos a limpeza da linha azul da rota e dos pontos de parada
        if (this.routeLayer) this.map.removeLayer(this.routeLayer);
        this.stopMarkers.forEach(m => this.map.removeLayer(m));
        
        // 2. Zeramos o dicionário de ônibus para a próxima busca (Nova lógica)
        this.busMarkers = {};
        
        // Mantemos a limpeza das variáveis antigas
        this.routeLayer = null;
        this.stopMarkers = [];
    }
}

// Inicializar App após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});