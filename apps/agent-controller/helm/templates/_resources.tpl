{{- define "opencrane.agentController.resources" -}}
{{- if .Values.agentController.enabled }}
{{- if not .Values.agentController.kubernetesApiServerCidrs }}
{{- fail "agentController.enabled=true requires at least one exact agentController.kubernetesApiServerCidrs entry for bounded Kubernetes API egress" }}
{{- end }}
{{- if not .Values.agentController.image.digest }}
{{- fail "agentController.enabled=true requires an immutable agentController.image.digest" }}
{{- end }}
{{- if not .Values.agentController.runtimeProfile.image.digest }}
{{- fail "agentController.enabled=true requires an immutable agentController.runtimeProfile.image.digest" }}
{{- end }}
{{- $controllerName := "agent-controller" -}}
{{- $runtimeServiceAccount := default "agent-runtime-default" .Values.agentController.runtimeProfile.serviceAccountName -}}
{{- $openCraneInternalUrl := default (printf "http://%s-opencrane-server.%s.svc.cluster.local:%v" (include "opencrane.fullname" .) .Release.Namespace .Values.clustertenantManager.service.internalPort) .Values.agentController.openCraneInternalUrl -}}
{{- $runtimeStreamUrl := default (printf "%s/api/internal/agent-runtime" $openCraneInternalUrl) .Values.agentController.runtimeProfile.runtimeStreamUrl -}}
{{- $runtimeImage := printf "%s@%s" .Values.agentController.runtimeProfile.image.repository .Values.agentController.runtimeProfile.image.digest -}}
{{- $controllerImage := printf "%s@%s" .Values.agentController.image.repository .Values.agentController.image.digest -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ $controllerName }}
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-controller
automountServiceAccountToken: false
---
# Runtime Jobs share one bounded identity class. No RoleBinding grants it Kubernetes API access.
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ $runtimeServiceAccount }}
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-runtime
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ $controllerName }}
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-controller
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "create"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["networkpolicies"]
    verbs: ["get", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ $controllerName }}
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-controller
subjects:
  - kind: ServiceAccount
    name: {{ $controllerName }}
    namespace: {{ .Release.Namespace }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ $controllerName }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "opencrane.fullname" . }}-agent-controller
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-controller
spec:
  replicas: {{ .Values.agentController.replicas }}
  selector:
    matchLabels:
      {{- include "opencrane.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: agent-controller
  template:
    metadata:
      labels:
        {{- include "opencrane.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: agent-controller
    spec:
      serviceAccountName: {{ $controllerName }}
      automountServiceAccountToken: false
      enableServiceLinks: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        fsGroupChangePolicy: OnRootMismatch
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: agent-controller
          image: {{ $controllerImage | quote }}
          imagePullPolicy: {{ .Values.agentController.image.pullPolicy }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
            readOnlyRootFilesystem: true
          env:
            - name: OPENCRANE_INTERNAL_URL
              value: {{ $openCraneInternalUrl | quote }}
            - name: OPENCRANE_CONTROLLER_TOKEN_PATH
              value: /var/run/opencrane/tokens/opencrane.token
            - name: AGENT_CONTROLLER_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: AGENT_CONTROLLER_POLL_INTERVAL_MS
              value: {{ .Values.agentController.pollIntervalMs | quote }}
            - name: AGENT_CONTROLLER_PROFILES_JSON
              value: {{ dict .Values.agentController.runtimeProfile.name (dict "image" $runtimeImage "imagePullPolicy" .Values.agentController.runtimeProfile.image.pullPolicy "runtimeStreamUrl" $runtimeStreamUrl "serverNamespace" .Release.Namespace "serviceAccountName" $runtimeServiceAccount "releaseSelectorLabels" (dict "app.kubernetes.io/name" (include "opencrane.name" .) "app.kubernetes.io/instance" .Release.Name) "serverPort" .Values.clustertenantManager.service.internalPort "projectedTokenTtlSeconds" .Values.agentController.runtimeProfile.projectedTokenTtlSeconds "scratchSize" .Values.agentController.runtimeProfile.scratchSize "activeDeadlineSeconds" .Values.agentController.runtimeProfile.activeDeadlineSeconds "ttlSecondsAfterFinished" .Values.agentController.runtimeProfile.ttlSecondsAfterFinished "resources" .Values.agentController.runtimeProfile.resources) | toJson | quote }}
            {{- include "opencrane.observabilityEnv" (dict "ctx" $ "component" "agent-controller") | nindent 12 }}
          volumeMounts:
            - name: opencrane-token
              mountPath: /var/run/opencrane/tokens
              readOnly: true
            - name: kubernetes-api-access
              mountPath: /var/run/secrets/kubernetes.io/serviceaccount
              readOnly: true
            - name: tmp
              mountPath: /tmp
          resources:
            {{- toYaml .Values.agentController.resources | nindent 12 }}
      volumes:
        - name: opencrane-token
          projected:
            defaultMode: 0440
            sources:
              - serviceAccountToken:
                  path: opencrane.token
                  audience: opencrane-agent-controller
                  expirationSeconds: {{ .Values.agentController.projectedTokenTtlSeconds }}
        - name: kubernetes-api-access
          projected:
            defaultMode: 0440
            sources:
              - serviceAccountToken:
                  path: token
                  expirationSeconds: {{ .Values.agentController.kubernetesTokenTtlSeconds }}
              - configMap:
                  name: kube-root-ca.crt
                  items:
                    - key: ca.crt
                      path: ca.crt
              - downwardAPI:
                  items:
                    - path: namespace
                      fieldRef:
                        fieldPath: metadata.namespace
        - name: tmp
          emptyDir:
            sizeLimit: 64Mi
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "opencrane.fullname" . }}-agent-controller
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: agent-controller
spec:
  podSelector:
    matchLabels:
      {{- include "opencrane.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: agent-controller
  policyTypes: ["Ingress", "Egress"]
  ingress: []
  egress:
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
    - to:
        {{- range .Values.agentController.kubernetesApiServerCidrs }}
        - ipBlock:
            cidr: {{ . | quote }}
        {{- end }}
      ports:
        - protocol: TCP
          port: {{ .Values.agentController.kubernetesApiServerPort }}
    {{- if .Values.observability.otel.enabled }}
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/component: otel-collector
      ports:
        - protocol: TCP
          port: {{ .Values.observability.otel.collector.otlpPort }}
    {{- end }}
{{- end }}
{{- end }}
