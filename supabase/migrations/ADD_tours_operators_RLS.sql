-- Enable RLS on tours_operators table
ALTER TABLE tours_operators ENABLE ROW LEVEL SECURITY;

-- Policy: Operators can read their own profile
CREATE POLICY "Operators read own profile"
ON tours_operators
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

-- Policy: Operators can update their own profile
CREATE POLICY "Operators update own profile"
ON tours_operators
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- Policy: Admins can read all operators
CREATE POLICY "Admins read all operators"
ON tours_operators
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy: Allow insert for new operator registration
CREATE POLICY "Users create operator profile"
ON tours_operators
FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'tours_operators';
