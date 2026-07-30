import { defineConfig } from 'vite';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    {
      name: 'api-convert-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url ? req.url.split('?')[0] : '';
          console.log(`[Vite API Dev] ${req.method} ${req.url} (Path: ${urlPath})`);

          if (urlPath === '/api/convert' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              console.log(`[Vite API Dev] /api/convert body length: ${body.length}`);
              try {
              const { fileName, base64 } = JSON.parse(body);
              if (!fileName || !base64) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing fileName or base64 data' }));
                return;
              }

              // 建立暫存目錄 (Workspace 下的 scratch)
              const scratchDir = path.join(__dirname, 'scratch');
              if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
              }

              const tempFilePath = path.join(scratchDir, `temp_${Date.now()}_${fileName}`);
              const buffer = Buffer.from(base64, 'base64');
              fs.writeFileSync(tempFilePath, buffer);

              // 執行虛擬環境中的 python 執行 markitdown
              const pythonPath = path.join(__dirname, 'venv', 'bin', 'python3');
              if (!fs.existsSync(pythonPath)) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Python virtual environment not found. Please install dependencies.' }));
                if (fs.existsSync(tempFilePath)) {
                  fs.unlinkSync(tempFilePath);
                }
                return;
              }

              // 呼叫 python3 -m markitdown <tempFilePath>
              exec(`"${pythonPath}" -m markitdown "${tempFilePath}"`, (error, stdout, stderr) => {
                // 清理暫存檔
                if (fs.existsSync(tempFilePath)) {
                  fs.unlinkSync(tempFilePath);
                }

                if (error) {
                  console.error('MarkItDown Error:', stderr);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Failed to convert file', details: stderr || error.message }));
                  return;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: stdout }));
              });
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Server parse error', details: err.message }));
            }
          });
        } else if (urlPath === '/api/yt-transcript' && req.method === 'POST') {
          // YouTube 字幕解析
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            console.log(`[Vite API Dev] /api/yt-transcript body length: ${body.length}`);
            try {
              const { url } = JSON.parse(body);
              if (!url) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing url' }));
                return;
              }

              // 從 YouTube 連結中提取 Video ID
              let videoId = '';
              const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
              const match = url.match(regExp);
              if (match && match[2].length === 11) {
                videoId = match[2];
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid YouTube URL' }));
                return;
              }

              const pythonPath = path.join(__dirname, 'venv', 'bin', 'python3');
              if (!fs.existsSync(pythonPath)) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Python virtual environment not found.' }));
                return;
              }
              
              // 透過 python 執行 youtube-transcript-api 獲取字幕，若無字幕則自動降級為 NotebookLM/Gemini 語音轉譯 (使用 inline_data 免除 File API 限制)
              const pyScript = `import sys
import os
import time
import json
import base64
import subprocess
import urllib.request
import urllib.error

def print_err(msg):
    print(msg, file=sys.stderr, flush=True)

def http_request(url, data=None, headers=None, params=None, method='GET', timeout=300):
    import urllib.parse
    headers = headers or {}
    params = params or {}
    
    if params:
        url = url + '?' + urllib.parse.urlencode(params)
        
    post_data = None
    if data is not None:
        if isinstance(data, bytes):
            post_data = data
        else:
            post_data = json.dumps(data).encode('utf-8')
            if 'Content-Type' not in headers:
                headers['Content-Type'] = 'application/json'
                
    req = urllib.request.Request(url, data=post_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        raise e

def transcribe_fallback(video_id, scratch_dir):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise Exception("Missing GEMINI_API_KEY environment variable for transcribe fallback")
        
    temp_audio = os.path.join(scratch_dir, f"yt_audio_{video_id}_{int(time.time())}.mp3")
    
    print_err("Subtitles disabled. Falling back to NotebookLM (Gemini Transcribe) method...")
    print_err("Downloading audio using yt-dlp...")
    
    yt_dlp_cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "24K",
        "-o", temp_audio.replace(".mp3", ".%(ext)s"),
        f"https://www.youtube.com/watch?v={video_id}"
    ]
    
    subprocess.run(yt_dlp_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    if not os.path.exists(temp_audio):
        raise Exception("Failed to download audio file")
        
    try:
        print_err("Reading audio file and encoding to base64...")
        with open(temp_audio, "rb") as fh:
            audio_base64 = base64.b64encode(fh.read()).decode("utf-8")
            
        print_err("Transcribing audio using Gemini API (inline_data)...")
        models = ["gemini-2.5-flash", "gemini-1.5-flash"]
        prompt = "請為這段中文音訊產出完整的繁體中文逐字稿。如果是訪談、演講或多人對談，請務必自動標註說話者（例如：說話者 A、說話者 B）並加上時間軸（格式如 [hh:mm:ss]）。"
        
        headers = {}
        params = {"key": api_key}
            
        transcript = None
        for model in models:
            gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": "audio/mp3",
                                    "data": audio_base64
                                }
                            },
                            {
                                "text": prompt
                            }
                        ]
                    }
                ]
            }
            code, gen_bytes = http_request(gen_url, data=payload, headers=headers, params=params, method='POST')
            if code == 200:
                gen_json = json.loads(gen_bytes.decode('utf-8'))
                candidates = gen_json.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    transcript = "".join([part.get("text", "") for part in parts])
                    break
            else:
                print_err(f"Model {model} returned code {code}: {gen_bytes.decode('utf-8')}")
                
        if not transcript:
            raise Exception("Failed to generate content with Gemini")
            
        return transcript
        
    finally:
        if os.path.exists(temp_audio):
            os.remove(temp_audio)

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    video_id = sys.argv[1]
    scratch_dir = sys.argv[2]
    
    try:
        api = YouTubeTranscriptApi()
        data = api.fetch(video_id, languages=['zh-Hant', 'zh-TW', 'zh-HK', 'zh-Hans', 'zh-CN', 'zh', 'en'])
        text = " ".join([item.text if hasattr(item, 'text') else item['text'] for item in data])
        print(text)
    except Exception as api_err:
        try:
            text = transcribe_fallback(video_id, scratch_dir)
            print(text)
        except Exception as fb_err:
            print_err(f"Fallback failed: {str(fb_err)}")
            raise api_err
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

              const scratchDir = path.join(__dirname, 'scratch');
              if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
              }
              const pyScriptPath = path.join(scratchDir, `yt_${Date.now()}.py`);
              fs.writeFileSync(pyScriptPath, pyScript);

              exec(`"${pythonPath}" "${pyScriptPath}" "${videoId}" "${scratchDir}"`, { env: process.env }, (error, stdout, stderr) => {
                if (fs.existsSync(pyScriptPath)) {
                  fs.unlinkSync(pyScriptPath);
                }

                if (error) {
                  console.error('YT Transcript Error:', stderr);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Failed to fetch transcript', details: stderr || error.message }));
                  return;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text: stdout }));
              });

            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Server parse error', details: err.message }));
            }
          });
        } else {
          next();
        }
      });
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const convertHtmlPath = path.resolve(distDir, 'convert.html');
      if (fs.existsSync(convertHtmlPath)) {
        const geminiDir = path.resolve(distDir, 'Gemini');
        if (!fs.existsSync(geminiDir)) {
          fs.mkdirSync(geminiDir, { recursive: true });
        }
        fs.copyFileSync(convertHtmlPath, path.resolve(geminiDir, '生成Gemini.html'));
        console.log('[Vite Build Post] Successfully copied convert.html to Gemini/生成Gemini.html');
      }
    }
  }
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        convert: path.resolve(__dirname, 'convert.html'),
      }
    }
  }
});
