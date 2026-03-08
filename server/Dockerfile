FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/

EXPOSE 3000

CMD ["sh", "-c", "python manage.py migrate && gunicorn --timeout 90 --bind 0.0.0.0:3000 monopoly_server.asgi:application -k uvicorn.workers.UvicornWorker"]
