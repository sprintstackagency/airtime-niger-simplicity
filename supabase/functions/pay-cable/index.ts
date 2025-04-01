
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.22.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Create a Supabase client with the service role key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request data
    const { packageId, smartCardNumber, customerName, reference } = await req.json();

    if (!packageId || !smartCardNumber || !reference) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the package details
    const { data: packageData, error: packageError } = await supabase
      .from('cable_packages')
      .select('*, cable_providers(*)')
      .eq('id', packageId)
      .single();

    if (packageError || !packageData) {
      return new Response(
        JSON.stringify({ error: 'Cable package not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the user's profile to check their balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has enough balance
    if (profile.balance < packageData.amount) {
      return new Response(
        JSON.stringify({ error: 'Insufficient balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Integrate with actual cable provider API here
    // This is a mock implementation for demo purposes
    const success = Math.random() > 0.1; // 90% success rate for demo

    if (success) {
      // Deduct from user's balance
      const { error: updateBalanceError } = await supabase.rpc(
        'add_to_balance',
        { 
          user_uuid: user.id, 
          amount_to_add: -packageData.amount 
        }
      );

      if (updateBalanceError) {
        console.error('Balance update error:', updateBalanceError);
        return new Response(
          JSON.stringify({ error: 'Failed to update user balance' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record the transaction
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: 'cable',
          amount: packageData.amount,
          status: 'success',
          reference,
          provider: packageData.cable_providers.code,
          recipient: smartCardNumber,
          details: {
            smart_card_number: smartCardNumber,
            customer_name: customerName || "Unknown Customer",
            provider_name: packageData.cable_providers.name,
            package_name: packageData.name,
            duration: packageData.duration,
            transaction_date: new Date().toISOString()
          }
        });

      if (transactionError) {
        console.error('Transaction record error:', transactionError);
        return new Response(
          JSON.stringify({ error: 'Failed to record transaction' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: `${packageData.name} subscription successful`,
          data: {
            amount: packageData.amount,
            smartcard: smartCardNumber,
            customer: customerName || "Unknown Customer",
            provider: packageData.cable_providers.name,
            package: packageData.name,
            duration: packageData.duration,
            reference,
            date: new Date().toISOString()
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Record failed transaction
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: 'cable',
          amount: packageData.amount,
          status: 'failed',
          reference,
          provider: packageData.cable_providers.code,
          recipient: smartCardNumber,
          details: {
            smart_card_number: smartCardNumber,
            customer_name: customerName || "Unknown Customer",
            provider_name: packageData.cable_providers.name,
            package_name: packageData.name,
            error: "Service provider API failure"
          }
        });

      if (transactionError) {
        console.error('Transaction record error:', transactionError);
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Service provider API failure' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Cable subscription edge function error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
