import { createClient } from "@supabase/supabase-js";
const supabase = createClient("http://127.0.0.1:54329", "mock-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: "Bearer e2e-tourist" } },
});
const bytes = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const file = new File([bytes], "me.jpg", { type: "image/jpeg" });
const { data, error } = await supabase.storage.from("tours-avatars").upload("tours-avatars/9b7e5a5e-0000-4000-8000-000000000001/avatar-1.jpg", file, { contentType: "image/jpeg", upsert: false });
console.log("upload:", error ? { message: error.message, status: error.statusCode } : data);
const url = supabase.storage.from("tours-avatars").getPublicUrl("tours-avatars/9b7e5a5e-0000-4000-8000-000000000001/avatar-1.jpg").data.publicUrl;
console.log("publicUrl:", url);
const img = await fetch(url);
console.log("fetch:", img.status, img.headers.get("content-type"), (await img.arrayBuffer()).byteLength);
const row = await supabase.from("profiles").update({ full_name: "Juan Miguel Dela Cruz", avatar_url: url }).eq("id", "9b7e5a5e-0000-4000-8000-000000000001").select("id");
console.log("update:", row.error ? row.error.message : row.data);
const read = await supabase.from("profiles").select("full_name, avatar_url").eq("id", "9b7e5a5e-0000-4000-8000-000000000001").maybeSingle();
console.log("read:", read.error ? read.error.message : read.data);
const del = await supabase.storage.from("tours-avatars").remove(["tours-avatars/9b7e5a5e-0000-4000-8000-000000000001/avatar-1.jpg"]);
console.log("remove:", del.error ? del.error.message : del.data);
