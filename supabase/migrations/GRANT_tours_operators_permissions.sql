-- Grant base permissions to authenticated role
GRANT SELECT, INSERT, UPDATE ON tours_operators TO authenticated;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tours_operators';
