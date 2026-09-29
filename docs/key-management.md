# Gestão de chaves financeiras

Destinos de levantamento são cifrados no servidor com `prively_payout_encryption_key`, guardada no Vault; nunca é enviada para o browser nem aparece em logs. A chave deve ser criada no Vault, rotacionada por uma janela controlada e auditada por Finanças/Segurança. Uma rotação exige re-encriptação forward-only dos destinos, validação dos recibos e retenção da chave anterior só até concluir a migração.

SMS step-up permanece bloqueado até existir fornecedor configurado e aprovado. A função não substitui o MFA pelo texto de uma interface. Cada leitura de destino exige AAL2 e regista `financial_audit_log`.
