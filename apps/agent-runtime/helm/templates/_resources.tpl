{{- define "opencrane.agentRuntime.resources" -}}
{{- if .Values.agentRuntime.enabled }}
{{- $fullName := include "opencrane.fullname" . -}}
{{- $runtimeStreamUrl := .Values.agentRuntime.openCraneRuntimeStreamUrl | default (printf "http://%s-opencrane-server.%s.svc.cluster.local:%v/api/internal/agent-runtime" $fullName .Release.Namespace .Values.clustertenantManager.service.internalPort) -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ $fullName }}-agent-runtime
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-runtime
automountServiceAccountToken: false
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $fullName }}-agent-runtime
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-runtime
spec:
  replicas: {{ .Values.agentRuntime.replicas }}
  selector:
    matchLabels:
      {{- include "opencrane.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: agent-runtime
  template:
    metadata:
      labels:
        {{- include "opencrane.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: agent-runtime
    spec:
      serviceAccountName: {{ $fullName }}-agent-runtime
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: agent-runtime
          image: "{{ .Values.agentRuntime.image.repository }}:{{ .Values.agentRuntime.image.tag }}"
          imagePullPolicy: {{ .Values.agentRuntime.image.pullPolicy }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
          env:
            - name: OPENCRANE_RUNTIME_STREAM_URL
              value: {{ $runtimeStreamUrl | quote }}
            - name: OPENCRANE_RUNTIME_TOKEN_PATH
              value: /var/run/opencrane/tokens/runtime.token
            - name: POD_UID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.uid
          volumeMounts:
            - name: runtime-token
              mountPath: /var/run/opencrane/tokens
              readOnly: true
            - name: scratch
              mountPath: /tmp
          resources:
            {{- toYaml .Values.agentRuntime.resources | nindent 12 }}
      volumes:
        - name: runtime-token
          projected:
            defaultMode: 0400
            sources:
              - serviceAccountToken:
                  path: runtime.token
                  audience: opencrane-agent-runtime
                  expirationSeconds: {{ .Values.agentRuntime.projectedTokenTtlSeconds }}
        # Scratch is explicitly non-durable. Runtime-local tenant storage is prohibited.
        - name: scratch
          emptyDir:
            sizeLimit: {{ .Values.agentRuntime.scratchSize | quote }}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ $fullName }}-agent-runtime
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-runtime
spec:
  podSelector:
    matchLabels:
      {{- include "opencrane.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: agent-runtime
  policyTypes: ["Ingress", "Egress"]
  ingress: []
  egress:
    # The shell can initiate a stream only to its server authority; it has no model, tool,
    # artifact, Obot, or public-internet route in this first deployable boundary.
    - to:
        - podSelector:
            matchLabels:
              {{- include "opencrane.selectorLabels" . | nindent 14 }}
              app.kubernetes.io/component: opencrane-server
      ports:
        - protocol: TCP
          port: {{ .Values.clustertenantManager.service.internalPort }}
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
{{- end }}
{{- end }}
