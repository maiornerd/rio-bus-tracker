# 🚌 Rio Bus Tracker (Busão RJ)

![Status](https://img.shields.io/badge/Status-Em%20Produ%C3%A7%C3%A3o-success)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Python](https://img.shields.io/badge/Backend-Python_FastAPI-3776AB?logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E?logo=javascript&logoColor=black)

Uma aplicação Full-Stack desenvolvida para rastreamento em tempo real da frota de ônibus da cidade do Rio de Janeiro. O sistema consome dados de GPS oficiais da prefeitura via satélite e renderiza as posições, rotas e paradas em um mapa interativo, processando arquivos GTFS.

🔗 **[Acesse a aplicação ao vivo aqui](https://rio-bus-tracker.vercel.app/)**

---

## ✨ Funcionalidades

* **Rastreamento em Tempo Real:** Atualização automática da posição e velocidade dos veículos a cada 3 segundos.
* **Mapeamento de Rotas (GTFS):** Renderização precisa do trajeto (shapes) e dos pontos de parada de cada linha utilizando Leaflet.js.
* **Sistema de Favoritos:** Salvamento local (`localStorage`) das linhas mais acessadas para busca rápida.
* **Geolocalização:** Botão integrado para centralizar o mapa na localização atual do usuário via GPS do dispositivo.
* **PWA (Progressive Web App):** Suporte nativo para instalação em dispositivos móveis (Android e iOS) para uso em tela cheia.
* **Dark/Light Mode:** Interface responsiva que se adapta à preferência do sistema do usuário.

---

## 🏗️ Arquitetura e Tecnologias

A aplicação segue uma arquitetura moderna e desacoplada, dividida em dois ecossistemas:

### Frontend (Hospedado na Vercel)
* **HTML5, CSS3 e Vanilla JavaScript (ES6+)** - Sem frameworks pesados para garantir carregamento instantâneo.
* **Leaflet.js** - Biblioteca open-source para mapas interativos.
* **PWA Manifest & Service Workers** - Para experiência de aplicativo nativo.

### Backend Proxy (Hospedado no Render)
* **Python 3.10+ & FastAPI** - Criação de rotas assíncronas de alta performance.
* **Httpx** - Cliente HTTP assíncrono para consumo da API da Mobilidade Rio.
* O backend atua como um *Proxy Reverso*, protegendo o front-end contra bloqueios de CORS e manipulando a carga de dados.

---

## 🚀 Desafios Técnicos Resolvidos

Durante o desenvolvimento, a API pública da Prefeitura do Rio (`dados.mobilidade.rio`) passou a retornar um payload massivo (cerca de 480.000 registros e +100MB por requisição), o que causava vazamento de memória (**Out of Memory - OOM**) em ambientes de nuvem gratuitos com limitação de RAM (512MB).

**A Solução de Engenharia:**
Em vez de utilizar o *parser* JSON nativo do Python (que alocaria todos os registros na memória RAM simultaneamente), foi implementada uma solução de **Extração via Expressões Regulares (Regex)**. O servidor lê a resposta bruta da prefeitura como uma única *String* e extrai cirurgicamente apenas os blocos de texto referentes à linha solicitada pelo usuário, convertendo para dicionário apenas a fração necessária de dados. 
* **Resultado:** Redução do consumo de memória de ~600MB para menos de 60MB, garantindo estabilidade 100% no plano gratuito.

---

## 💻 Como rodar localmente

Se você deseja clonar e rodar este projeto na sua máquina local:

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/maiornerd/rio-bus-tracker.git](https://github.com/maiornerd/rio-bus-tracker.git)
   cd rio-bus-tracker

2. **Inicie o Servidor Backend:**
    ```bash
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload

3. **Inicie o Frontend:**
    Abra a pasta raiz do projeto e execute o `index.html` usando uma extensão como o Live Server do VS Code. Certifique-se de alterar o endpoint da API no arquivo `js/app.js` para apontar para o seu localhost.

## 👨‍💻 Autor
**Alan da Silva do Carmo**

Desenvolvedor Full-Stack

*Projeto desenvolvido como portfólio prático de engenharia de software e integração de dados georreferenciados.*