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
    char *cursor = row, *end; long coordinates[5];
    int arc = row[0] == 'A';
    if ((arc || row[0] == 'L') && row[1] == ' ') cursor += 2;
    else if (arc || row[0] == 'L') { result = fail("Invalid geometry type"); goto cleanup; }
    for (int i = 0; i < (arc ? 5 : 4); i++) {
      errno = 0; coordinates[i] = strtol(cursor, &end, 10);
      if (end == cursor || errno || coordinates[i] < -1000000 || coordinates[i] > 1000000 || !isspace((unsigned char)*end)) { result = fail("Invalid coordinate"); goto cleanup; }
      cursor = end; while (*cursor == ' ' || *cursor == '\t') cursor++;
    }
    cursor[strcspn(cursor, "\r\n")] = 0;
    if (!*cursor || strlen(cursor) > 255) { result = fail("Invalid layer"); goto cleanup; }
    for (char *p = cursor; *p; p++) if (!(isalnum((unsigned char)*p) || *p == ' ' || *p == '_' || *p == '-')) { result = fail("Unsupported layer name"); goto cleanup; }
    if (!arc && coordinates[0] == coordinates[2] && coordinates[1] == coordinates[3]) { result = fail("Zero-length line"); goto cleanup; }
    BITCODE_H existing_layer = dwg_find_tablehandle(dwg, cursor, "LAYER");
    BITCODE_HV layer_handle;
    if (existing_layer) layer_handle = existing_layer->absolute_ref;
    else {
      Dwg_Object_LAYER *layer = dwg_add_LAYER(dwg, cursor);
      if (!layer) { result = fail("Cannot initialize layer"); goto cleanup; }
      layer_handle = dwg->object[layer->parent->objid].handle.value;
    }
    Dwg_Object_Entity *parent;
    dwg_point_3d a = {(double)coordinates[0], (double)coordinates[1], 0};
    if (arc) {
      long radius=coordinates[2], start=coordinates[3], end_angle=coordinates[4];
      if (radius<=0 || start<0 || start>=360 || end_angle<0 || end_angle>=360 || start%90 || end_angle%90 || (end_angle-start+360)%360!=90) {result=fail("Unsupported arc");goto cleanup;}
      const long ux[4]={1,0,-1,0}, uy[4]={0,1,0,-1};
      for(int j=0;j<2;j++) {int k=(j?end_angle:start)/90;long x=coordinates[0]+radius*ux[k],y=coordinates[1]+radius*uy[k];if(x < -1000000 || x > 1000000 || y < -1000000 || y > 1000000){result=fail("Arc outside limits");goto cleanup;}}
      const double radians = 3.14159265358979323846 / 180.0;
      Dwg_Entity_ARC *entity=dwg_add_ARC(space,&a,(double)radius,start*radians,end_angle*radians);
      if(!entity){result=fail("Cannot add arc");goto cleanup;} parent=entity->parent;
    } else {
      dwg_point_3d b = {(double)coordinates[2], (double)coordinates[3], 0};
      Dwg_Entity_LINE *entity = dwg_add_LINE(space, &a, &b);
      if (!entity) { result = fail("Cannot add line"); goto cleanup; } parent=entity->parent;
    }
    parent->layer = dwg_add_handleref(dwg, 5, layer_handle, NULL);
  }
  if (ferror(input) || !count) { result = fail("Missing geometry"); goto cleanup; }
  if (dwg_write_file(argv[2], dwg) != 0) result = fail("DWG write failed");
cleanup:
  fclose(input); dwg_free(dwg); free(dwg); return result;
}
