# DEV local: roles disponíveis mesmo antes da integração WSL.
FROM public.ecr.aws/supabase/postgres:17.6.1.167@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb
COPY --chmod=0444 config/roles.sql /docker-entrypoint-initdb.d/init-scripts/99-gg-roles.sql
