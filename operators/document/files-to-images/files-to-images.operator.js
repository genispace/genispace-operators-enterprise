/**
 * GeniSpace Files To Images Operator
 *
 * Turns every attachment of one audit answer into PNG data URLs.
 *
 * @category document
 * @version 1.0.0
 * @author GeniSpace AI Team
 */

module.exports = {
  info: {
    name: 'files-to-images',
    title: '附件转图片',
    description: '把一组附件一次转为 PNG data URL，供多模态模型读图。支持图片、PDF；Office 需本机 LibreOffice。',
    version: '1.0.0',
    category: 'document',
    tags: ['image', 'pdf', 'png', 'vision', 'document'],
    author: 'GeniSpace AI Team',
    license: 'MIT',
  },
  routes: './files-to-images.routes.js',
  openapi: {
    paths: {
      '/convert': {
        post: {
          summary: '附件转 PNG data URL',
          description: '一次接收附件数组，内部处理每个文件，返回 data:image/png;base64,... 列表',
          tags: ['附件转图片'],
          security: [{ GeniSpaceAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    attachments: {
                      type: 'array',
                      description: '附件列表，每项含 fileId 或 url',
                    },
                    maxPagesPerFile: {
                      type: 'number',
                      description: '每个文件最多渲染的页数，默认 10',
                    },
                    maxImages: {
                      type: 'number',
                      description: '本次最多返回的图片数，默认 20',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '转换完成',
            },
          },
        },
      },
    },
  },
};
