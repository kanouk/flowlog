-- Add DELETE policy for user_ai_settings
CREATE POLICY "Users can delete their own AI settings"
ON public.user_ai_settings
FOR DELETE
USING (auth.uid() = user_id);