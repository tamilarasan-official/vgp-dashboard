import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles, SessionUser } from '../auth/auth.util';
import { UPLOAD_SOURCES, UploadSource, UploadsService } from './uploads.service';

const source = (s: string): UploadSource => {
  if (!(s in UPLOAD_SOURCES)) throw new BadRequestException('Unknown source');
  return s as UploadSource;
};

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Options for the upload form (report types, companies). */
  @Get('config')
  config() {
    return UPLOAD_SOURCES;
  }

  /** POST /api/uploads/:source { fileName, contentBase64, reportType, company?, periodFrom?, periodTo?, note? } */
  @Post(':source')
  @Roles('tally_uploader', 'feedback_uploader')
  create(@Param('source') s: string, @Body() body: Record<string, string>, @Req() req: { user: SessionUser }) {
    const src = source(s);
    const allowed = req.user.role === 'admin' || (UPLOAD_SOURCES[src].roles as readonly string[]).includes(req.user.role);
    if (!allowed) throw new ForbiddenException('You cannot upload to this section');
    return this.uploads.create(src, req.user.id, body);
  }

  @Get(':source')
  list(@Param('source') s: string) {
    return this.uploads.list(source(s));
  }

  @Get(':source/latest')
  latest(@Param('source') s: string) {
    return this.uploads.latest(source(s));
  }

  /** Download the original file. */
  @Get('file/:id')
  async file(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const f = await this.uploads.file(id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName.replace(/"/g, '')}"`);
    res.send(Buffer.from(f.content));
  }

  @Delete('file/:id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.uploads.remove(id);
  }
}
