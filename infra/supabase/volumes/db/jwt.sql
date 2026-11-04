-- Suppress statement/error-query logging before handling signing material.
set log_statement = none;
set log_min_error_statement = panic;
\set jwt_exp `echo "$JWT_EXP"`

-- JWT_SECRET pertence ao Auth/REST/Storage e ao emissor protegido, nunca a um GUC legível por login SQL.
-- Em bancos existentes, inventariar e remover o GUC legado somente após GO C; ver runbook AUD-IMG-02.
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
