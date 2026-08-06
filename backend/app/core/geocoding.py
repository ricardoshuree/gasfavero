# [mcp-local harness] feature: delegacao-venda-fase2-geocoding | plano: 0144c501 | 2026-08-06 20:12:56
# Cliente da Google Geocoding API, best-effort, nunca levanta excecao
"""
Cliente da Google Geocoding API -- Fase 2 da Delegação de Venda.

Traduz um endereço em texto (rua + número + bairro + cidade) pra
latitude/longitude. Usado UMA VEZ por endereço, no momento da criação
(ver clientes.py:_create_endereco) -- o resultado fica cacheado nas
colunas Endereco.latitude/longitude pra sempre, nunca é re-consultado
automaticamente depois (endereço não muda de lugar). Retry manual
existe via POST /enderecos/{id}/geocodificar (geografia.py), pra
endereços antigos cadastrados antes desta feature existir.

BEST-EFFORT DE PROPÓSITO: qualquer falha aqui (API fora do ar, sem
API key configurada, endereço não encontrado, cota do dia estourada)
NUNCA deve impedir o cadastro do cliente/endereço em si -- geocode()
sempre retorna None em caso de erro, nunca levanta exceção. Quem
chama decide o que fazer com None (deixar lat/lng nulos, deixar pra
próxima tentativa manual).

Trava de segurança contra custo indevido: a cota diária da Geocoding
API está limitada a 300 requests/dia direto no Google Cloud Console
(APIs & Services > Quotas), não só aqui no código -- mesmo com um bug
que gerasse chamadas em loop, o Google corta antes de gerar custo
real (o free tier vai até 10.000/mês).
"""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Endereços da Distribuidora Gás Favero são sempre em Veranópolis/RS
# -- fixar isso na query evita ambiguidade com ruas de mesmo nome em
# outras cidades do Brasil (mesmo problema que já vimos na tentativa
# de usar a busca de CEP dos Correios, ver LogradouroReferencia em
# models.py).
CIDADE_UF_PADRAO = "Veranópolis, RS, Brasil"

# Timeout curto de propósito: geocodificação roda dentro do request
# síncrono de criar endereço (POST /clientes/ ou /clientes/{id}/
# endereco) -- não vale a pena deixar o atendente esperando muito por
# uma chamada externa que é best-effort.
TIMEOUT_SEGUNDOS = 5.0


def _montar_endereco_completo(rua_nome: str, numero: str, bairro_nome: str) -> str:
    return f"{rua_nome}, {numero} - {bairro_nome}, {CIDADE_UF_PADRAO}"


def geocode(
    *, rua_nome: str, numero: str, bairro_nome: str
) -> tuple[float, float] | None:
    """Geocodifica um endereço. Retorna (latitude, longitude) ou None
    se não configurado, falhar, ou não encontrar resultado -- nunca
    levanta exceção (ver docstring do módulo)."""
    if not settings.GOOGLE_GEOCODING_API_KEY:
        logger.info("Geocoding pulado: GOOGLE_GEOCODING_API_KEY não configurada")
        return None

    endereco_completo = _montar_endereco_completo(rua_nome, numero, bairro_nome)

    try:
        response = httpx.get(
            GEOCODING_API_URL,
            params={
                "address": endereco_completo,
                "key": settings.GOOGLE_GEOCODING_API_KEY,
                "region": "br",
            },
            timeout=TIMEOUT_SEGUNDOS,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Geocoding falhou para '%s': %s", endereco_completo, exc)
        return None

    status = data.get("status")
    if status != "OK":
        # ZERO_RESULTS é o caso mais comum (endereço não encontrado) --
        # não é erro de configuração, só não achou. OVER_QUERY_LIMIT
        # significa que a cota diária estourou (trava de segurança
        # fazendo o trabalho dela). Ambos são logados como warning,
        # não error -- são esperados em algum volume.
        logger.warning(
            "Geocoding sem resultado para '%s': status=%s", endereco_completo, status
        )
        return None

    resultados = data.get("results") or []
    if not resultados:
        return None

    location = resultados[0].get("geometry", {}).get("location")
    if not location or "lat" not in location or "lng" not in location:
        return None

    return (location["lat"], location["lng"])
