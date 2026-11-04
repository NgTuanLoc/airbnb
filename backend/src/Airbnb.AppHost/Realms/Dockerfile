# Keycloak with the Acme realm baked in, for the local Kubernetes cluster (LocalCluster.cs), which can't bind-mount the
# realm file the way `aspire run` does. The AppHost passes the image the Keycloak integration uses.
ARG KEYCLOAK_IMAGE
FROM ${KEYCLOAK_IMAGE}
COPY acme-realm.json /opt/keycloak/data/import/
