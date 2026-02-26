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
            const response = await fetch(`https://rio-bus-api.onrender.com/api/onibus/${lineCode}`);
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
        this.busMarkers = {}; // Suporte a múltiplos ônibus
        this.routeLayer = null;
        this.stopMarkers = [];
        this.userMarker = null; // Rastreio do usuário (GPS)
        this.pollingInterval = null;
        this.currentLine = null;
        
        // Carrega favoritos do banco de dados do navegador (localStorage)
        this.favorites = JSON.parse(localStorage.getItem('rioBusFavorites')) || [];
        this.showingFavorites = false;

        this.bootstrapApp();
    }

    async bootstrapApp() {
        const searchInput = document.getElementById('bus-search');
        searchInput.disabled = true;
        searchInput.placeholder = "Carregando malha viária do Rio...";

        await this.dataService.loadRoutes();

        searchInput.disabled = false;
        searchInput.placeholder = "Buscar linha (ex: 474, 107)...";

        this.initMap();
        this.bindEvents();
        this.initTheme();
    }

    initMap() {
        this.map = L.map('map', { zoomControl: false }).setView([-22.9068, -43.1729], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '© OpenStreetMap'
        }).addTo(this.map);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    }

    bindEvents() {
        const searchInput = document.getElementById('bus-search');
        const resultsList = document.getElementById('autocomplete-results');
        const themeToggle = document.getElementById('theme-toggle');
        const btnLocation = document.getElementById('btn-location');
        const btnFavoriteToggle = document.getElementById('btn-favorite-toggle');
        const filterBtns = document.querySelectorAll('.btn-filter');

        // Lógica de Autocompletar
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toUpperCase();
            resultsList.innerHTML = '';
            
            if (query.length < 2 && !this.showingFavorites) {
                resultsList.classList.add('hidden');
                return;
            }

            // Filtra as linhas buscando por texto. Se a aba de favoritos estiver ativa, busca só nos favoritos.
            let results = Object.keys(this.dataService.routesDB).filter(line => {
                const route = this.dataService.routesDB[line];
                const matchesText = line.includes(query) || route.dest.toUpperCase().includes(query);
                const isFavorite = this.favorites.includes(line);
                
                return this.showingFavorites ? (matchesText && isFavorite) : matchesText;
            });

            this.renderAutocomplete(results);
        });

        // Alternar entre abas "Todas" e "Favoritas"
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                this.showingFavorites = e.target.textContent.includes('Favoritas');
                
                if (this.showingFavorites) {
                    // Se clicou em favoritas, mostra a lista salva imediatamente
                    this.renderAutocomplete(this.favorites);
                } else {
                    resultsList.classList.add('hidden');
                    searchInput.value = '';
                }
            });
        });

        // Eventos de Botões Isolados
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
        });

        btnLocation.addEventListener('click', () => this.getUserLocation());
        btnFavoriteToggle.addEventListener('click', () => this.toggleFavorite());
    }

    renderAutocomplete(resultsArray) {
        const resultsList = document.getElementById('autocomplete-results');
        resultsList.innerHTML = '';
        
        if (resultsArray.length > 0) {
            resultsList.classList.remove('hidden');
            resultsArray.forEach(line => {
                const li = document.createElement('li');
                const dest = this.dataService.routesDB[line] ? this.dataService.routesDB[line].dest : 'Desconhecido';
                // Adiciona uma estrelinha na busca se for favorito
                const starIcon = this.favorites.includes(line) ? '⭐ ' : ''; 
                li.textContent = `${starIcon}${line} - ${dest}`;
                
                li.onclick = () => {
                    document.getElementById('bus-search').value = line;
                    resultsList.classList.add('hidden');
                    this.selectLine(line);
                };
                resultsList.appendChild(li);
            });
        } else {
            resultsList.classList.add('hidden');
        }
    }

    initTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    async selectLine(lineCode) {
        this.currentLine = lineCode;
        const route = this.dataService.routesDB[lineCode];
        if(!route) return;
        
        // Atualiza a interface
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('loading-indicator').classList.remove('hidden');
        document.getElementById('info-panel').classList.add('hidden');

        this.clearMap();

        // Checa se é favorita para acender ou apagar a estrela
        const starBtn = document.getElementById('btn-favorite-toggle');
        if (this.favorites.includes(lineCode)) {
            starBtn.classList.add('star-active');
            starBtn.textContent = '★'; // Estrela preenchida
        } else {
            starBtn.classList.remove('star-active');
            starBtn.textContent = '☆'; // Estrela vazia
        }

        // Desenhar Trajeto
        this.routeLayer = L.polyline(route.path, { color: 'var(--primary)', weight: 5, opacity: 0.7 }).addTo(this.map);
        this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });

        // Desenhar Paradas
        route.stops.forEach(stop => {
            const marker = L.circleMarker([stop.lat, stop.lng], {
                radius: 5, fillColor: '#ffffff', color: 'var(--primary)', weight: 2, fillOpacity: 1
            }).addTo(this.map).bindPopup(`<b>${stop.name}</b>`);
            this.stopMarkers.push(marker);
        });

        // Preencher Painel
        document.getElementById('bus-line').textContent = route.name;
        
        const stopsList = document.getElementById('stops-list');
        stopsList.innerHTML = '';
        route.stops.forEach(stop => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${stop.name}</strong>`;
            stopsList.appendChild(li);
        });

        this.startRealTimeTracking();
    }

    toggleFavorite() {
        if (!this.currentLine) return;
        
        const index = this.favorites.indexOf(this.currentLine);
        const starBtn = document.getElementById('btn-favorite-toggle');

        if (index === -1) {
            // Não é favorito, então vamos adicionar
            this.favorites.push(this.currentLine);
            starBtn.classList.add('star-active');
            starBtn.textContent = '★';
        } else {
            // Já é favorito, então vamos remover
            this.favorites.splice(index, 1);
            starBtn.classList.remove('star-active');
            starBtn.textContent = '☆';
        }

        // Salva no banco de dados do navegador
        localStorage.setItem('rioBusFavorites', JSON.stringify(this.favorites));
    }

    async getUserLocation() {
        if (!navigator.geolocation) {
            alert("Seu navegador não suporta geolocalização.");
            return;
        }

        const btn = document.getElementById('btn-location');
        btn.textContent = "⏳"; // Indicador de carregamento

        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Desenha um ponto vermelho marcando a localização do usuário
            if (this.userMarker) {
                this.userMarker.setLatLng([lat, lng]);
            } else {
                this.userMarker = L.circleMarker([lat, lng], {
                    radius: 8, fillColor: "#e74c3c", color: "#c0392b", weight: 3, fillOpacity: 1
                }).addTo(this.map).bindPopup("<b>Você está aqui!</b>");
            }

            // Animação da câmera voando até o usuário
            this.map.flyTo([lat, lng], 15, { animate: true, duration: 1.5 });
            btn.textContent = "📍";
        }, (error) => {
            console.warn("Erro de GPS:", error);
            alert("Não foi possível acessar seu GPS. Verifique se o navegador tem permissão.");
            btn.textContent = "📍";
        }, { enableHighAccuracy: true });
    }

    async startRealTimeTracking() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(() => this.updateBusPosition(), 3000);
        await this.updateBusPosition();

        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('info-panel').classList.remove('hidden');
    }

    async updateBusPosition() {
        if (!this.currentLine) return;
        
        const frota = await this.dataService.getRealTimeBusLocation(this.currentLine);
        
        const statusBadge = document.getElementById('bus-status');
        if (frota.length === 0) {
            statusBadge.textContent = "Nenhum veículo ativo";
            statusBadge.style.backgroundColor = "var(--text-muted)";
            return;
        }

        statusBadge.textContent = `${frota.length} em operação`;
        statusBadge.style.backgroundColor = "var(--success)";
        document.getElementById('bus-speed').textContent = `${frota[0].speed} (carro líder)`;
        document.getElementById('bus-last-update').textContent = frota[0].timestamp;

        const idsAtivos = new Set(frota.map(b => b.ordem));

        frota.forEach(bus => {
            const busIcon = L.divIcon({
                html: `<div style="background-color: var(--primary); color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); font-size: 11px; font-weight: bold;">${bus.speed}</div>`,
                className: '', iconSize: [30, 30], iconAnchor: [15, 15]
            });

            const popupContent = `<b>Carro:</b> ${bus.ordem}<br><b>Velocidade:</b> ${bus.speed} km/h<br><b>Visto em:</b> ${bus.timestamp}`;

            if (!this.busMarkers[bus.ordem]) {
                const marker = L.marker([bus.lat, bus.lng], { icon: busIcon })
                                .bindPopup(popupContent)
                                .addTo(this.map);
                this.busMarkers[bus.ordem] = marker;
            } else {
                const marker = this.busMarkers[bus.ordem];
                marker.setLatLng([bus.lat, bus.lng]);
                marker.setIcon(busIcon);
                marker.getPopup().setContent(popupContent);
            }
        });

        Object.keys(this.busMarkers).forEach(ordemId => {
            if (!idsAtivos.has(ordemId)) {
                this.map.removeLayer(this.busMarkers[ordemId]);
                delete this.busMarkers[ordemId];
            }
        });
    }

    clearMap() {
        if (this.busMarkers) {
            Object.values(this.busMarkers).forEach(m => this.map.removeLayer(m));
        }
        if (this.routeLayer) this.map.removeLayer(this.routeLayer);
        this.stopMarkers.forEach(m => this.map.removeLayer(m));
        
        this.busMarkers = {};
        this.routeLayer = null;
        this.stopMarkers = [];
    }
}

// Inicializar App após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});