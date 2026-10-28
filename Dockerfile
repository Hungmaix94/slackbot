FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python3 -c "import gzip, shutil, os; shutil.copyfileobj(gzip.open('srs_fts.db.gz', 'rb'), open('srs_fts.db', 'wb')) if os.path.exists('srs_fts.db.gz') and not os.path.exists('srs_fts.db') else None"

EXPOSE 8080

CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
