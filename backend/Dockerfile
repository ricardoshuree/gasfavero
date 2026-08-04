# [mcp-local harness] feature: add-simple-backend-dockerfile | plano: 0a67ab0a | 2026-08-04 00:10:09
# Dockerfile simples e exclusivo do backend, resolvendo a perda de pacotes entre estagios do Railpack
# Dockerfile simples, exclusivo para o backend (Railway).
# Diferente do Dockerfile.monorepo-unused (herdado do template), este NAO
# builda o frontend junto -- so o backend Python, com contexto de build
# escopado a esta pasta (Root Directory = backend no Railway).

FROM python:3.14-slim

WORKDIR /app

# Copia so o pyproject.toml primeiro para aproveitar cache de camada do
# Docker quando so o codigo da aplicacao mudar (nao as dependencias)
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Copia o resto do codigo da aplicacao
COPY . .

# $PORT e injetado pelo Railway em runtime -- shell form do CMD para
# permitir a expansao da variavel de ambiente
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
