{{/*
Expand the name of the chart.
*/}}
{{- define "opencrane.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "opencrane.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "opencrane.labels" -}}
helm.sh/chart: {{ include "opencrane.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: opencrane
{{- end }}

{{/*
Selector labels for a component
*/}}
{{- define "opencrane.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opencrane.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Resolve deployment environment for validation rules.
*/}}
{{- define "opencrane.environment" -}}
{{- default "dev" .Values.global.environment | lower -}}
{{- end }}

{{/*
Operator RBAC rules — shared by the cluster-scoped (legacy) and namespaced
(multi-instance) bindings so both grant identical verbs over identical resources.
All resources here are namespaced, so the same rule list is valid in a Role.
*/}}
{{- define "opencrane.operatorRbacRules" -}}
# Tenant and AccessPolicy CRDs
- apiGroups: ["opencrane.io"]
  resources: ["tenants", "tenants/status", "accesspolicies"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Per-tenant resources the operator manages
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["services", "configmaps", "persistentvolumeclaims"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# ServiceAccounts for Workload Identity
- apiGroups: [""]
  resources: ["serviceaccounts"]
  verbs: ["get", "list", "create", "update", "patch"]
# Secrets for encryption keys
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "create", "update", "patch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses", "networkpolicies"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Cilium policies (optional, if Cilium is installed)
- apiGroups: ["cilium.io"]
  resources: ["ciliumnetworkpolicies"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
# Events for audit trail
- apiGroups: [""]
  resources: ["events"]
  verbs: ["create", "patch"]
{{- end }}

{{/*
Resolve the namespace(s) a multi-instance install owns for namespaced RBAC.
Defaults to the release namespace when `multiInstance.instanceNamespaces` is empty.
*/}}
{{- define "opencrane.instanceNamespaces" -}}
{{- $mi := .Values.multiInstance | default dict -}}
{{- $ns := $mi.instanceNamespaces | default (list) -}}
{{- if $ns -}}
{{- $ns | toJson -}}
{{- else -}}
{{- list .Release.Namespace | toJson -}}
{{- end -}}
{{- end }}

{{/*
Whether namespaced (per-instance) RBAC should be rendered instead of cluster-scoped.
*/}}
{{- define "opencrane.namespacedRbac" -}}
{{- $mi := .Values.multiInstance | default dict -}}
{{- and $mi.enabled (eq (default "namespaced" $mi.rbac) "namespaced") -}}
{{- end }}

{{/*
Validation guardrails for sensitive LiteLLM configuration.
*/}}
{{- define "opencrane.validate" -}}
{{- $env := include "opencrane.environment" . -}}
{{- if and .Values.litellm.enabled (not (or (eq $env "dev") (eq $env "development"))) -}}
	{{- $usingExistingSecret := not (empty .Values.litellm.existingSecret) -}}
	{{- $generateMasterKey := true -}}
	{{- if hasKey .Values.litellm "generateMasterKey" -}}
		{{- $generateMasterKey = .Values.litellm.generateMasterKey -}}
	{{- end -}}
	{{- $masterKey := default "" .Values.litellm.masterKey -}}
	{{- $placeholder := "change-me-in-production" -}}
	{{- if and (not $usingExistingSecret) (not $generateMasterKey) (or (empty $masterKey) (eq $masterKey $placeholder)) -}}
		{{- fail "LiteLLM is enabled in non-dev environment, but no secure master key is configured. Set litellm.existingSecret, set litellm.generateMasterKey=true, or provide a non-placeholder litellm.masterKey." -}}
	{{- end -}}
{{- end -}}
{{- end }}
