/* SPDX-License-Identifier: GPL-3.0-or-later
 * MagicCAD: bounded 2D writer through the public LibreDWG API.
 */
#include <dwg.h>
#include <dwg_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
static int fail(const char *message) { fprintf(stderr, "%s\n", message); return 1; }
int main(int argc, char **argv) {
  if (argc != 3) return fail("Usage: magiccad-dwg-write input.lines output.dwg");
  FILE *input = fopen(argv[1], "rb");
  if (!input) return fail("Cannot open geometry input");
  Dwg_Data *dwg = dwg_new_Document(R_2000, 0, 0);
  if (!dwg) { fclose(input); return fail("Cannot initialize DWG"); }
  dwg->header_vars.INSUNITS = 4;
  Dwg_Object *model = dwg_model_space_object(dwg);
  Dwg_Object_BLOCK_HEADER *space = model ? model->tio.object->tio.BLOCK_HEADER : NULL;
  int result = 0, count = 0;
  char row[1024];
  if (!space) { result = fail("Missing model space"); goto cleanup; }
  while (fgets(row, sizeof(row), input)) {
    if (!strchr(row, '\n') || ++count > 80000) { result = fail("Invalid geometry input length"); goto cleanup; }
    char *cursor = row, *end; long coordinates[4];
    for (int i = 0; i < 4; i++) {
      errno = 0; coordinates[i] = strtol(cursor, &end, 10);
      if (end == cursor || errno || coordinates[i] < -1000000 || coordinates[i] > 1000000 || !isspace((unsigned char)*end)) { result = fail("Invalid coordinate"); goto cleanup; }
      cursor = end; while (*cursor == ' ' || *cursor == '\t') cursor++;
    }
    cursor[strcspn(cursor, "\r\n")] = 0;
    if (!*cursor || strlen(cursor) > 255) { result = fail("Invalid layer"); goto cleanup; }
    for (char *p = cursor; *p; p++) if (!(isalnum((unsigned char)*p) || *p == ' ' || *p == '_' || *p == '-')) { result = fail("Unsupported layer name"); goto cleanup; }
    if (coordinates[0] == coordinates[2] && coordinates[1] == coordinates[3]) { result = fail("Zero-length line"); goto cleanup; }
    BITCODE_H existing_layer = dwg_find_tablehandle(dwg, cursor, "LAYER");
    BITCODE_HV layer_handle;
    if (existing_layer) layer_handle = existing_layer->absolute_ref;
    else {
      Dwg_Object_LAYER *layer = dwg_add_LAYER(dwg, cursor);
      if (!layer) { result = fail("Cannot initialize layer"); goto cleanup; }
      layer_handle = dwg->object[layer->parent->objid].handle.value;
    }
    dwg_point_3d a = {(double)coordinates[0], (double)coordinates[1], 0}, b = {(double)coordinates[2], (double)coordinates[3], 0};
    Dwg_Entity_LINE *line = dwg_add_LINE(space, &a, &b);
    if (!line) { result = fail("Cannot add line"); goto cleanup; }
    line->parent->layer = dwg_add_handleref(dwg, 5, layer_handle, NULL);
  }
  if (ferror(input) || !count) { result = fail("Missing geometry"); goto cleanup; }
  if (dwg_write_file(argv[2], dwg) != 0) result = fail("DWG write failed");
cleanup:
  fclose(input); dwg_free(dwg); free(dwg); return result;
}
