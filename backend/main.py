from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from datetime import datetime
import gc # Importante para faxina de memória

app = FastAPI(title="Rio Bus Tracker - Proxy API")

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
    async with httpx.AsyncClient(timeout=25.0) as client:
        try:
            print(f"\n[📡] Buscando linha: '{linha}'")
            
            response = await client.get(DATA_RIO_URL)
            response.raise_for_status()
            
            # 1. Carrega o JSON
            payload = response.json()
            
            # 2. Destrói o arquivo bruto da memória instantaneamente
            del response
            gc.collect()
            
            if isinstance(payload, dict):
                onibus_ativos = payload.get("data", [])
                del payload
            else:
                onibus_ativos = payload
                
            print(f"[✅] Lote recebido: {len(onibus_ativos)} pontos de GPS. Filtrando...")
            
            frota_recente = {}
            linha_buscada = linha.strip().lstrip('0').upper()
            
            # 3. Esvazia a lista dinamicamente enquanto processa (Garante Zero OOM!)
            while onibus_ativos:
                v = onibus_ativos.pop()
                
                if isinstance(v, dict):
                    linha_api = str(v.get("linha", "")).strip().lstrip('0').upper()
                    
                    if linha_api == linha_buscada:
                        ordem = str(v.get("ordem", "")).strip()
                        if not ordem:
                            continue
                            
                        try:
                            ts = float(str(v.get("datahora", 0)).replace(',', '.'))
                            if ts > 9999999999: 
                                ts /= 1000 
                        except:
                            ts = 0

                        # Lógica Crucial: Só aceita a posição se for mais nova que a anterior!
                        if ordem not in frota_recente or ts > frota_recente[ordem].get('ts_raw', 0):
                            try:
                                hora_formatada = datetime.fromtimestamp(ts).strftime('%H:%M:%S')
                            except:
                                hora_formatada = str(v.get("datahora", ""))

                            lat_str = str(v.get("latitude", 0)).replace(',', '.')
                            lng_str = str(v.get("longitude", 0)).replace(',', '.')
                            speed_str = str(v.get("velocidade", 0)).replace(',', '.')

                            frota_recente[ordem] = {
                                "ordem": ordem,
                                "lat": float(lat_str),
                                "lng": float(lng_str),
                                "speed": float(speed_str),
                                "timestamp": hora_formatada,
                                "ts_raw": ts
                            }
            
            # Limpa chaves temporárias e cria a lista final
            veiculos_finais = []
            for veiculo in frota_recente.values():
                veiculo.pop("ts_raw", None)
                veiculos_finais.append(veiculo)
            
            print(f"[🚍] Restaram {len(veiculos_finais)} ônibus únicos rodando AGORA na linha {linha_buscada}.")
            
            if not veiculos_finais:
                raise HTTPException(status_code=404, detail="Nenhum ônibus rodando no momento.")
            
            return {"linha": linha, "veiculos": veiculos_finais}
            
        except httpx.HTTPStatusError as e:
            print(f"[❌] Erro HTTP da prefeitura: {e}")
            raise HTTPException(status_code=502, detail="Servidor da Prefeitura indisponível.")
        except Exception as e:
            print(f"[❌] Erro interno: {e}")
            raise HTTPException(status_code=500, detail="Erro interno no processamento.")