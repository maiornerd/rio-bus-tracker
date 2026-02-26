from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from datetime import datetime

app = FastAPI(title="Rio Bus Tracker - Proxy API")

# Configuração corrigida do CORS para Nuvem
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, 
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_RIO_URL = "https://dados.mobilidade.rio/gps/sppo"

@app.get("/api/onibus/{linha}")
async def obter_posicoes_linha(linha: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            print(f"\n[📡] Frontend pediu dados da linha: '{linha}'")
            
            response = await client.get(DATA_RIO_URL)
            response.raise_for_status()
            payload = response.json()
            
            if isinstance(payload, dict):
                onibus_ativos = payload.get("data", [])
            else:
                onibus_ativos = payload
                
            print(f"[✅] Satélite retornou {len(onibus_ativos)} ônibus rodando no Rio inteiro.")
            
            frota = []
            linha_buscada = linha.strip().lstrip('0').upper()
            
            for v in onibus_ativos:
                if isinstance(v, dict):
                    linha_api = str(v.get("linha", "")).strip().lstrip('0').upper()
                    
                    if linha_api == linha_buscada:
                        try:
                            ts = float(str(v.get("datahora", 0)).replace(',', '.'))
                            if ts > 9999999999: 
                                ts /= 1000 
                            hora_formatada = datetime.fromtimestamp(ts).strftime('%H:%M:%S')
                        except Exception:
                            hora_formatada = str(v.get("datahora", ""))

                        lat_str = str(v.get("latitude", 0)).replace(',', '.')
                        lng_str = str(v.get("longitude", 0)).replace(',', '.')
                        speed_str = str(v.get("velocidade", 0)).replace(',', '.')

                        frota.append({
                            "ordem": str(v.get("ordem", "")),
                            "lat": float(lat_str),
                            "lng": float(lng_str),
                            "speed": float(speed_str),
                            "timestamp": hora_formatada
                        })
            
            print(f"[🚍] Encontrados {len(frota)} veículos para a linha {linha_buscada}.")
            
            if not frota:
                raise HTTPException(status_code=404, detail="Nenhum ônibus rodando no momento.")
            
            return {"linha": linha, "veiculos": frota}
            
        except httpx.HTTPStatusError as e:
            print(f"[❌] Erro HTTP ao contatar a prefeitura: {e}")
            raise HTTPException(status_code=502, detail="Servidor da Prefeitura indisponível.")
        except Exception as e:
            print(f"[❌] Erro interno no processamento: {e}")
            raise HTTPException(status_code=500, detail="Erro interno no nosso backend.")