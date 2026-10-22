/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const APIs = require('../../utils/api');
const config = require('../../config');
const { downloadYouTubeVideo } = require('../../utils/ytDlp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function convertVideoToMp4(buffer, extension) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knightbot-video-'));
  const inputPath = path.join(tempDir, 'input.' + extension);
  const outputPath = path.join(tempDir, 'output.mp4');

  try {
    await fs.promises.writeFile(inputPath, buffer);
    await execFileAsync(process.env.FFMPEG_BIN || 'ffmpeg', [
      '-y', '-i', inputPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath
    ], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });

    const converted = await fs.promises.readFile(outputPath);
    if (converted.length < 1024 || converted.subarray(4, 8).toString() !== 'ftyp') {
      throw new Error('ffmpeg output is not a valid MP4 file');
    }
    return converted;
  } catch (error) {
    throw new Error('WebM-to-MP4 conversion failed: ' +
      (error.stderr || error.message || error).toString().slice(-1800));
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  name: 'ytvideo',
  aliases: ['ytv', 'ytmp4', 'ytvid', 'video'],
  category: 'media',
  description: 'Download video from YouTube',
  usage: '.video <video name or URL>',

  async execute(sock, msg, args) {
    try {
      const text = args.join(' ').trim();
      const chatId = msg.key.remoteJid;

      const searchQuery = text.trim();

      if (!searchQuery) {
        return await sock.sendMessage(chatId, {
          text: 'What video do you want to download?'
        }, { quoted: msg });
      }

      // Determine if input is a YouTube link
      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';

      if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
        videoUrl = searchQuery;
      } else {
        // Search YouTube for the video
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: 'No videos found!'
          }, { quoted: msg });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
        videoThumbnail = videos[0].thumbnail;
      }

      // Send thumbnail immediately
      try {
        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
        const captionTitle = videoTitle || searchQuery;
        if (thumb) {
          await sock.sendMessage(chatId, {
            image: { url: thumb },
            caption: `*${captionTitle}*\nDownloading...`
          }, { quoted: msg });
        }
      } catch (e) {
        console.error('[VIDEO] thumb error:', e?.message || e);
      }

      // Validate YouTube URL
      let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
      if (!urls) {
        return await sock.sendMessage(chatId, {
          text: 'This is not a valid YouTube link!'
        }, { quoted: msg });
      }

      // Download directly with the locally tested yt-dlp fallback.
      console.log('[VIDEO] Starting local yt-dlp download:', videoUrl);

      const fallback = await downloadYouTubeVideo(videoUrl);

      if (!fallback?.buffer?.length) {
        throw new Error('yt-dlp returned an empty video buffer');
      }

      let videoBuffer = fallback.buffer;
      const sourceExtension = (fallback.extension || 'mp4').toLowerCase();

      if (sourceExtension !== 'mp4') {
        console.log('[VIDEO] Converting', sourceExtension, 'to WhatsApp-compatible MP4...');
        videoBuffer = await convertVideoToMp4(videoBuffer, sourceExtension);
        console.log('[VIDEO] MP4 conversion complete:', videoBuffer.length, 'bytes');
      }

      const safeTitle = (fallback.title || videoTitle || 'video')
        .replace(/[^\w\s-]/g, '')
        .trim() || 'video';

      console.log('[VIDEO] Download complete:', fallback.buffer.length, 'bytes');
      console.log('[VIDEO] Starting WhatsApp send to:', chatId);

      const sendStartedAt = Date.now();

      try {
        const sendResult = await sock.sendMessage(chatId, {
          video: videoBuffer,
          mimetype: 'video/mp4',
          fileName: `${safeTitle}.mp4`,
          caption: `*${videoTitle || 'Video'}*\n\n> *_Downloaded by ${config.botName}_*`
        }, { quoted: msg });

        console.log(
          '[VIDEO] WhatsApp sendMessage resolved in',
          Math.round((Date.now() - sendStartedAt) / 1000),
          'seconds'
        );
                console.log('[VIDEO] Send result:', sendResult ? 'message object returned' : 'empty result');
        console.log('[VIDEO] Sent message key:', JSON.stringify(sendResult?.key || null));
        console.log('[VIDEO] Sent message ID:', sendResult?.key?.id || 'NO_ID');
      } catch (sendError) {
        console.error('[VIDEO] WhatsApp send failed:', sendError?.stack || sendError?.message || sendError);
        throw sendError;
      }
    } catch (error) {
      console.error('[VIDEO] Command Error:', error?.message || error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'âš ï¸ I could not retrieve this video from the available providers. They may be offline, misconfigured, or the video may be unavailable in this region. I cannot bypass copyright or regional restrictions; please open the video directly on YouTube.'
      }, { quoted: msg });
    }
  }
};
