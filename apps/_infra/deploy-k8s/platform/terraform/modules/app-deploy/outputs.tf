output "ingress_ip"
{
  description = "External IP address of the ingress controller"
  value       = google_compute_global_address.ingress_ip.address
}

output "control_plane_url"
{
  description = "URL for the OpenCrane opencrane-ui UI"
  value       = "https://${var.domain}"
}
