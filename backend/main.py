from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from datetime import datetime
import gc
import re
import json

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
    async with httpx.AsyncClient(timeout=40.0) as client:
        try:
            print(f"\n[📡] Buscando linha: '{linha}'")
            
            response = await client.get(DATA_RIO_URL)
            response.raise_for_status()
            
            # A GRANDE SACADA: Carregamos a resposta como texto bruto
            raw_text = response.text
            tamanho_mb = len(raw_text) / (1024 * 1024)
            print(f"[✅] Satélite retornou {tamanho_mb:.1f} MB de dados brutos. Filtrando a seco...")
            
            linha_buscada = linha.strip().lstrip('0').upper()
            
            # Expressão Regular Ninja: Extrai apenas os pedaços de texto dos ônibus desejados.
            # Burlar o parser nativo evita que a RAM exploda criando quase meio milhão de dicionários.
            pattern = r'\{[^{}]*"linha"\s*:\s*"?[ 0]*' + re.escape(linha_buscada) + r'(?:"|\b)[^{}]*\}'
            matches = re.findall(pattern, raw_text, re.IGNORECASE)
            
            # Faxina instantânea da memória (Destrói o texto original)
            del raw_text
            del response
            gc.collect()
            
            print(f"[🔍] Foram extraídos {len(matches)} registros brutos para a linha {linha_buscada}.")
            
            frota_recente = {}
            
            # Só agora, de forma segura, convertemos os poucos ônibus encontrados para Dicionário
            for block in matches:
                try:
                    v = json.loads(block)
                    
                    ordem = str(v.get("ordem", "")).strip()
                    if not ordem:
                        continue
                        
                    try:
                        ts = float(str(v.get("datahora", 0)).replace(',', '.'))
                        if ts > 9999999999: 
                            ts /= 1000 
                    except:
                        ts = 0

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
                except json.JSONDecodeError:
                    continue # Ignora segurança se a Regex pegar um bloco mal formado
            
            veiculos_finais = []
            for veiculo in frota_recente.values():
                veiculo.pop("ts_raw", None)
                veiculos_finais.append(veiculo)
            
            print(f"[🚍] Restaram {len(veiculos_finais)} ônibus únicos rodando AGORA.")
            
            if not veiculos_finais:
                raise HTTPException(status_code=404, detail="Nenhum ônibus rodando no momento.")
            
            return {"linha": linha, "veiculos": veiculos_finais}
            
        except httpx.HTTPStatusError as e:
            print(f"[❌] Erro HTTP da prefeitura: {e}")
            raise HTTPException(status_code=502, detail="Servidor da Prefeitura indisponível.")
        except Exception as e:
            print(f"[❌] Erro interno: {e}")
            raise HTTPException(status_code=500, detail="Erro interno no processamento.")