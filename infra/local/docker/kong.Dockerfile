# DEV local: configuração embutida dispensa bind mounts no reboot.
FROM public.ecr.aws/supabase/kong:2.8.1@sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d
COPY --chmod=0444 config/kong.yml /gg/kong.yml
COPY --chmod=0555 config/kong-entrypoint.sh /gg/kong-entrypoint.sh
