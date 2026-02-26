import pandas as pd
import json

def extrair_rotas_gtfs(linhas_desejadas, output_file="rotas_extraidas.json"):
    print("Carregando arquivos GTFS na memória...")
    print("Aguarde, o arquivo stop_times.txt costuma ser pesado...")
    
    # 1. Carregando os arquivos básicos (Shapes e Trips)
    # Usamos dtype=str nos IDs para evitar que o Pandas corte zeros à esquerda
    routes = pd.read_csv("routes.txt", usecols=["route_id", "route_short_name", "route_long_name"], dtype=str)
    trips = pd.read_csv("trips.txt", usecols=["route_id", "trip_id", "shape_id", "direction_id"], dtype=str)
    shapes = pd.read_csv("shapes.txt", usecols=["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])
    
    # 2. NOVOS: Carregando Paradas e Tempos
    stops = pd.read_csv("stops.txt", usecols=["stop_id", "stop_name", "stop_lat", "stop_lon"], dtype=str)
    stop_times = pd.read_csv("stop_times.txt", usecols=["trip_id", "stop_id", "stop_sequence"], dtype=str)

    # Convertendo stop_sequence para numérico para garantir a ordenação correta
    stop_times["stop_sequence"] = pd.to_numeric(stop_times["stop_sequence"])

    banco_rotas = {}

    for linha in linhas_desejadas:
        print(f"\n🚌 Processando linha: {linha}...")
        
        # Acha a rota
        route_match = routes[routes["route_short_name"] == str(linha)]
        if route_match.empty:
            print(f" ❌ Linha {linha} não encontrada no routes.txt")
            continue
            
        route_id = route_match.iloc[0]["route_id"]
        route_name = route_match.iloc[0]["route_long_name"]

        # Acha uma viagem (trip) de ida (direction_id == '0')
        trip_match = trips[(trips["route_id"] == route_id) & (trips["direction_id"] == "0")]
        if trip_match.empty:
            # Fallback caso não tenha direction_id explícito
            trip_match = trips[trips["route_id"] == route_id]
            
        if trip_match.empty:
            print(f" ❌ Viagem não encontrada para a linha {linha}.")
            continue
            
        trip_id = trip_match.iloc[0]["trip_id"]
        shape_id = trip_match.iloc[0]["shape_id"]

        # --- EXTRAÇÃO DO TRAJETO (PATH) ---
        shape_points = shapes[shapes["shape_id"] == shape_id].sort_values("shape_pt_sequence")
        coordenadas_path = shape_points[["shape_pt_lat", "shape_pt_lon"]].values.tolist()

        # --- EXTRAÇÃO DAS PARADAS (STOPS) ---
        # Filtra os stop_times apenas para o trip_id que escolhemos e ordena
        paradas_da_viagem = stop_times[stop_times["trip_id"] == trip_id].sort_values("stop_sequence")
        
        # Faz um JOIN com a tabela 'stops' para pegar os nomes e coordenadas
        paradas_completas = pd.merge(paradas_da_viagem, stops, on="stop_id", how="inner")
        
        lista_paradas = []
        eta_estimado = 0 # Como o ETA em tempo real viria da API, simulamos um inicial aqui
        
        for index, row in paradas_completas.iterrows():
            lista_paradas.append({
                "name": str(row["stop_name"]).title(), # .title() formata ex: "Rua Uruguai"
                "lat": float(row["stop_lat"]),
                "lng": float(row["stop_lon"]),
                "etaMinutes": eta_estimado
            })
            # Incrementa ~4 minutos de distância entre cada ponto para o mock visual no front
            eta_estimado += 4 

        # --- MONTAGEM DO JSON DA LINHA ---
        banco_rotas[str(linha)] = {
            "name": str(linha),
            "dest": str(route_name).title(),
            "path": coordenadas_path,
            "stops": lista_paradas
        }
        
        print(f" ✅ Sucesso! Encontrados {len(coordenadas_path)} pontos de curva e {len(lista_paradas)} paradas.")

    # Salva o arquivo final
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(banco_rotas, f, ensure_ascii=False, indent=4)
    
    print(f"\n🚀 Extração concluída! Mova o arquivo '{output_file}' para a pasta 'data/' do seu front-end.")

# Você pode adicionar as linhas que quiser testar aqui!
if __name__ == "__main__":
    print("Descobrindo todas as linhas do Rio de Janeiro...")
    # Lê o routes.txt apenas para pegar todos os nomes curtos de linha
    todas_as_rotas = pd.read_csv("routes.txt", usecols=["route_short_name"], dtype=str)
    
    # Remove valores nulos, pega só os únicos e converte para uma lista Python
    lista_completa = todas_as_rotas["route_short_name"].dropna().unique().tolist()
    
    print(f"Encontradas {len(lista_completa)} linhas diferentes! Iniciando extração em massa...")
    
    # Roda a função para a cidade inteira
    extrair_rotas_gtfs(lista_completa)