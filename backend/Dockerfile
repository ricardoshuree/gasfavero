# [mcp-local harness] feature: fix-dockerfile-copy-order | plano: 163abe87 | 2026-08-04 00:12:21
# Corrige ordem: copia codigo completo antes do pip install para o hatchling conseguir montar o pacote
# Dockerfile simples, exclusivo para o backend (Railway).
# Diferente do Dockerfile.monorepo-unused (herdado do template), este NAO
# builda o frontend junto -- so o backend Python, com contexto de build
# escopado a esta pasta (Root Directory = backend no Railway).

FROM python:3.14-slim

WORKDIR /app

# Copia todo o codigo antes de instalar. O build backend deste projeto
# (hatchling) precisa enxergar a pasta app/ de verdade para montar o
# pacote wheel -- ele nao trabalha so com a lista de dependencias do
# pyproject.toml. Por isso nao da para copiar so o pyproject.toml antes
# do pip install (otimizacao de cache de camada que funcionaria com
# setuptools/poetry simples, mas nao com hatchling neste layout).
COPY . .

RUN pip install --no-cache-dir .

# $PORT e injetado pelo Railway em runtime -- shell form do CMD para
# permitir a expansao da variavel de ambiente
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
