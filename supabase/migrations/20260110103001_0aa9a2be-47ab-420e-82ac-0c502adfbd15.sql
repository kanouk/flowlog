-- Add UPDATE policy for blocks table
CREATE POLICY "Users can update their own blocks"
ON public.blocks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);