-- Seed data for the Prompt Formatter application
-- This file contains sample templates in various categories

-- Insert sample profiles (for testing purposes)
INSERT INTO profiles (id, email, full_name, avatar_url) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'john.doe@example.com', 'John Doe', 'https://example.com/avatars/john.jpg'),
('550e8400-e29b-41d4-a716-446655440002', 'jane.smith@example.com', 'Jane Smith', 'https://example.com/avatars/jane.jpg'),
('550e8400-e29b-41d4-a716-446655440003', 'bob.wilson@example.com', 'Bob Wilson', 'https://example.com/avatars/bob.jpg');

-- Insert sample templates
INSERT INTO templates (id, user_id, title, description, category, tags, content, is_public, is_favorite) VALUES
-- Coding Templates
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001', 'Code Review Assistant', 'AI-powered code review with best practices and suggestions', 'coding', ARRAY['code-review', 'best-practices', 'quality'], '{"prompt": "Please review the following code and provide feedback on:\n\n1. Code quality and readability\n2. Potential bugs or issues\n3. Performance improvements\n4. Security concerns\n5. Best practices adherence\n\nCode:\n{{code}}\n\nLanguage: {{language}}\nFramework: {{framework}}", "variables": {"code": "string", "language": "string", "framework": "string"}}', true, true),

('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440001', 'Bug Fix Generator', 'Generate bug fixes and explanations for common programming issues', 'coding', ARRAY['bug-fix', 'debugging', 'solutions'], '{"prompt": "I have the following error in my {{language}} code:\n\nError: {{error_message}}\n\nCode context:\n{{code_context}}\n\nPlease provide:\n1. A clear explanation of what caused this error\n2. The corrected code\n3. How to prevent this error in the future\n4. Any additional debugging tips", "variables": {"language": "string", "error_message": "string", "code_context": "string"}}', true, false),

('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440002', 'API Documentation Writer', 'Generate comprehensive API documentation from code or specifications', 'coding', ARRAY['api', 'documentation', 'swagger'], '{"prompt": "Please create comprehensive API documentation for the following {{api_type}}:\n\nAPI Name: {{api_name}}\nEndpoints: {{endpoints}}\nAuthentication: {{auth_method}}\n\nInclude:\n1. Overview and purpose\n2. Authentication details\n3. Endpoint descriptions with parameters\n4. Request/response examples\n5. Error codes and handling\n6. Rate limiting information\n7. Best practices for integration", "variables": {"api_type": "string", "api_name": "string", "endpoints": "string", "auth_method": "string"}}', true, true),

-- Marketing Templates
('550e8400-e29b-41d4-a716-446655440201', '550e8400-e29b-41d4-a716-446655440002', 'Social Media Post Creator', 'Generate engaging social media content for various platforms', 'marketing', ARRAY['social-media', 'content', 'engagement'], '{"prompt": "Create {{post_count}} engaging social media posts for {{platform}} about {{topic}}.\n\nBrand voice: {{brand_voice}}\nTarget audience: {{target_audience}}\nCall to action: {{cta}}\n\nEach post should include:\n1. Compelling headline\n2. Engaging content ({{platform}} character limit)\n3. Relevant hashtags\n4. Suggested image/video description\n5. Optimal posting time\n\nMake the content {{tone}} and include storytelling elements.", "variables": {"post_count": "number", "platform": "string", "topic": "string", "brand_voice": "string", "target_audience": "string", "cta": "string", "tone": "string"}}', true, false),

('550e8400-e29b-41d4-a716-446655440202', '550e8400-e29b-41d4-a716-446655440003', 'Email Campaign Writer', 'Create compelling email marketing campaigns with high conversion rates', 'marketing', ARRAY['email', 'campaign', 'conversion'], '{"prompt": "Write an email campaign for {{campaign_type}} with the following details:\n\nProduct/Service: {{product}}\nTarget audience: {{audience}}\nCampaign goal: {{goal}}\nValue proposition: {{value_prop}}\n\nInclude:\n1. Subject line (3 variations)\n2. Preheader text\n3. Opening hook\n4. Main content with benefits\n5. Social proof elements\n6. Strong call-to-action\n7. Follow-up sequence (3 emails)\n\nTone: {{tone}}\nLength: {{length}}", "variables": {"campaign_type": "string", "product": "string", "audience": "string", "goal": "string", "value_prop": "string", "tone": "string", "length": "string"}}', true, true),

-- Writing Templates
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440001', 'Blog Post Outliner', 'Generate comprehensive blog post outlines and structure', 'writing', ARRAY['blog', 'outline', 'structure'], '{"prompt": "Create a detailed blog post outline for the topic: {{topic}}\n\nTarget audience: {{audience}}\nBlog length: {{length}} words\nSEO focus: {{seo_keywords}}\n\nInclude:\n1. Compelling headline options (3 variations)\n2. Introduction hook ideas\n3. Main sections with subheadings\n4. Key points for each section\n5. Supporting examples and data points\n6. Conclusion structure\n7. Call-to-action suggestions\n8. Related topics for internal linking\n9. Meta description\n10. Social media snippets", "variables": {"topic": "string", "audience": "string", "length": "string", "seo_keywords": "string"}}', true, false),

('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440002', 'Product Description Writer', 'Create compelling product descriptions that drive sales', 'writing', ARRAY['product', 'description', 'sales'], '{"prompt": "Write a compelling product description for: {{product_name}}\n\nProduct category: {{category}}\nTarget customers: {{target_customers}}\nKey features: {{key_features}}\nBenefits: {{benefits}}\nPrice point: {{price_point}}\n\nRequirements:\n1. Attention-grabbing opening\n2. Feature-benefit mapping\n3. Emotional appeal elements\n4. Social proof integration\n5. Clear call-to-action\n6. SEO optimization\n7. Mobile-friendly formatting\n8. A/B testing variations (3 options)\n\nTone: {{tone}}\nLength: {{length}}", "variables": {"product_name": "string", "category": "string", "target_customers": "string", "key_features": "string", "benefits": "string", "price_point": "string", "tone": "string", "length": "string"}}', true, true);

-- Insert sample favorites
INSERT INTO favorites (user_id, template_id) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440101'),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440103'),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440201'),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301'),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440202'),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302');

-- Insert sample user integrations (encrypted tokens would be stored here)
INSERT INTO user_integrations (id, user_id, provider, access_token, workspace_name, workspace_id) VALUES
('550e8400-e29b-41d4-a716-446655440401', '550e8400-e29b-41d4-a716-446655440001', 'notion', 'encrypted_token_here', "John\'s Workspace", 'workspace_123'),
('550e8400-e29b-41d4-a716-446655440402', '550e8400-e29b-41d4-a716-446655440002', 'notion', 'encrypted_token_here', "Jane\'s Team", 'workspace_456');
