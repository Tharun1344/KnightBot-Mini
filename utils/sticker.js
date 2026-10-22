/**
 * Sticker Creation Utilities
 * Compatible with wa-sticker-formatter v4.x
 */

let Sticker, StickerTypes;
try {
  const waf = require('wa-sticker-formatter');
  Sticker = waf.Sticker;
  StickerTypes = waf.StickerTypes;
} catch (_e) {
  // wa-sticker-formatter not available — sticker commands will be disabled
}

const sharp = require('sharp');
const config = require('../config');

/**
 * Create sticker from image/video buffer
 */
const createStickerBuffer = async (media, options = {}) => {
  if (!Sticker) throw new Error('wa-sticker-formatter is not installed. Run npm install.');
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname || 'KnightBot',
      author: options.author || config.ownerName?.[0] || 'KnightBot',
      type: options.type || (StickerTypes ? StickerTypes.FULL : 'full'),
      categories: options.categories || ['🤖'],
      id: options.id || '',
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Sticker creation failed: ${error.message}`);
  }
};

/**
 * Create cropped sticker
 */
const createCroppedSticker = async (media, options = {}) => {
  if (!Sticker) throw new Error('wa-sticker-formatter is not installed. Run npm install.');
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname || 'KnightBot',
      author: options.author || config.ownerName?.[0] || 'KnightBot',
      type: StickerTypes ? StickerTypes.CROPPED : 'cropped',
      categories: options.categories || ['🤖'],
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Cropped sticker creation failed: ${error.message}`);
  }
};

/**
 * Create circle sticker
 */
const createCircleSticker = async (media, options = {}) => {
  if (!Sticker) throw new Error('wa-sticker-formatter is not installed. Run npm install.');
  try {
    const sticker = new Sticker(media, {
      pack: options.pack || config.packname || 'KnightBot',
      author: options.author || config.ownerName?.[0] || 'KnightBot',
      type: StickerTypes ? StickerTypes.CIRCLE : 'circle',
      categories: options.categories || ['🤖'],
      quality: options.quality || 50
    });
    
    return await sticker.toBuffer();
  } catch (error) {
    throw new Error(`Circle sticker creation failed: ${error.message}`);
  }
};

/**
 * Convert sticker to image
 */
const stickerToImage = async (stickerBuffer) => {
  try {
    const imageBuffer = await sharp(stickerBuffer)
      .png()
      .toBuffer();
    
    return imageBuffer;
  } catch (error) {
    throw new Error(`Sticker to image conversion failed: ${error.message}`);
  }
};

module.exports = {
  createStickerBuffer,
  createCroppedSticker,
  createCircleSticker,
  stickerToImage
};
