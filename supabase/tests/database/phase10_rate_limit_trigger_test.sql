select plan(2);

select has_function('public','phase10_rate_limit_trigger', 'phase10_rate_limit_trigger exists');
select has_trigger('public','topups','trg_phase10_topup_rate_limit', 'topup rate-limit trigger exists');

select * from finish();