FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
COPY apps/agent-runtime/src/runtime.py /app/runtime.py

USER 65532:65532
CMD ["python", "-B", "/app/runtime.py"]
