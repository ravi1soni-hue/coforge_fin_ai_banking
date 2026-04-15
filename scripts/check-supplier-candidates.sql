-- Check supplier payment run and urgent/deferable breakdown for a given user
SELECT urgency, SUM(amount) AS total_amount, COUNT(*) AS num_payments
FROM treasury_supplier_payment_candidates
WHERE user_id = '<YOUR-USER-ID>'
GROUP BY urgency;

-- Check all supplier payment candidates for the user
SELECT * FROM treasury_supplier_payment_candidates WHERE user_id = '<YOUR-USER-ID>' ORDER BY urgency DESC, amount DESC;
