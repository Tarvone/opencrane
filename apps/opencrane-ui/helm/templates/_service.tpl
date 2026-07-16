{{- define "opencrane.ui.service" -}}
{{- /* Service only exists for the chart-native SPA (controlPlaneSpa.enabled). The name is
       release-prefixed (B5) so it never collides with another instance, and is the exact
       name the same-origin ingress rule in apps/opencrane/helm/templates/_ingress.tpl
       derives when this is enabled. */ -}}
{{- if .Values.controlPlaneSpa.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "opencrane.fullname" . }}-opencrane-ui-spa
  labels:
    {{- include "opencrane.labels" . | nindent 4 }}
    app.kubernetes.io/component: opencrane-ui-spa
spec:
  type: ClusterIP
  selector:
    {{- include "opencrane.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: opencrane-ui-spa
  ports:
    - name: http
      port: {{ .Values.controlPlaneSpa.service.port }}
      targetPort: http
{{- end }}
{{- end }}
