HTMLWidgets.widget({

    name: 'spacesweep',

    type: 'output',

    initialize: function(el, width, height) {

        // defaults
        var defaults = {
            smallMargin: 5,
            widgetMargin: 10, // marging between widgets
            rootColour: '#DDDADA',
            pureColour: '#D3D2D2',
            monophyleticColour: '767676',
            polyphyleticColour: '000000',
            legendWidth: 100,
            legendTitleHeight: 16,
            mixtureClassFontSize: 13,
            max_r: 8, // maximum radius for tree nodes
            siteMark_r: 4, // site mark radius
            dragOn: false, // whether or not drag is on
            startLocation: Math.PI/2, // starting location [0, 2*Math.PI] of site ordering
            legendSpacing: 10, // spacing between legend items
            anatomy_male_image_ref: "https://bytebucket.org/mas29/public_resources/raw/c9e20e1236b6996a30bc2948627beb57ec185243/images/anatomy/muscle_anatomy_male.png",
            anatomy_female_image_ref: "https://bytebucket.org/mas29/public_resources/raw/c9e20e1236b6996a30bc2948627beb57ec185243/images/anatomy/muscle_anatomy_female.png"
        };

        // global variable vizObj
        vizObj = {};
        vizObj.data = {};
        vizObj.view = {};

        // set configurations
        var config = $.extend(true, {}, defaults);
        config.containerWidth = width;
        config.containerHeight = height;
        // diameter of the main view
        config.viewDiameter = ((config.containerWidth - config.legendWidth) < config.containerHeight) ? 
            (config.containerWidth - config.legendWidth) :
            config.containerHeight; 
        config.viewCentre = { x: config.viewDiameter/2, y: config.viewDiameter/2 };
        config.outerRadius = config.viewDiameter/2; 
        config.innerRadius = config.viewDiameter/6; // radius for centre circle (where anatomy will go)
        config.circBorderWidth = 3; // width for circular border width
        config.legendHeight = config.viewDiameter;
        // - 3, - 10 for extra space
        config.oncoMixWidth = ((config.outerRadius - config.circBorderWidth - config.innerRadius)/2) - 3; 
        config.treeWidth = ((config.outerRadius - config.circBorderWidth - config.innerRadius)/2) - 10; 
        config.radiusToOncoMix = config.innerRadius + config.oncoMixWidth/2; // radius to oncoMix centre
        config.radiusToTree = config.innerRadius + config.oncoMixWidth + config.treeWidth/2; // radius to tree centre
        config.legendTreeWidth = config.legendWidth - 2; // width of the tree in the legend

        // anatomical image configurations
        config.image_plot_width = config.innerRadius*2; // width of the plot space for the image
        config.image_top_l = {x: config.viewDiameter/2 - config.image_plot_width/2, 
                                y: config.viewDiameter/2 - config.image_plot_width/2};
        config.legend_image_plot_width = config.legendWidth; // width of the plot space for the image
        config.legend_image_top_l = {x: 0, y: config.legendTreeWidth + config.legendTitleHeight*2 + config.legendSpacing};

        // legend mixture classification configurations
        config.legend_mixture_top = config.legend_image_top_l.y + config.legend_image_plot_width + config.legendSpacing;

        vizObj.generalConfig = config;

        return {}

    },

    renderValue: function(el, x, instance) {

        var dim = vizObj.generalConfig;
        var viewType = "tree"; // choose from: "voronoi", "tree"

        // get params from R
        vizObj.userConfig = x;
        dim.nCells = x.n_cells;

        // GET CONTENT


        // get anatomic locations on image
        _getSiteLocationsOnImage(vizObj);

        // extract all info from tree about nodes, edges, ancestors, descendants
        _getTreeInfo(vizObj);

        // get colour assignment
        _getColours(vizObj);

        // site ids
        vizObj.site_ids = (vizObj.userConfig.site_ids == "NA") ? 
            _.uniq(_.pluck(vizObj.userConfig.clonal_prev, "site_id")):
            vizObj.userConfig.site_ids;

        // assign anatomic locations to each site
        _assignAnatomicLocations(vizObj);

        // get image bounds for current site data 
        _getImageBounds(vizObj);

        // if no site ordering is given by the user
        if (vizObj.userConfig.site_ids == "NA") {
            // initial ordering of sites based on their anatomic location
            _initialSiteOrdering(vizObj);
        }

        // get cellular prevalence data in workable format, and threshold it
        _getCPData(vizObj);
        _thresholdCPData(vizObj)

        // get site positioning
        _getSitePositioning(vizObj); // position elements for each site

        // get sites showing each genotype
        _getGenotypeSites(vizObj.data.genotypes_to_plot);

        // get colour palette
        _getColours(vizObj);

        console.log("vizObj");
        console.log(vizObj);

        // VIEW SETUP

        // radii (- 7 = how much space to give between nodes)
        var tree_height = vizObj.data.tree_height; // height of the tree (# nodes)
        var node_r = ((dim.treeWidth - 7*tree_height)/tree_height)/2; // site tree
        var legendNode_r = ((dim.legendTreeWidth - 7*tree_height)/tree_height)/2; // legend tree

        // make sure radii do not surpass the maximum
        dim.node_r = (node_r > dim.max_r) ? dim.max_r : node_r;
        dim.legendNode_r = (legendNode_r > dim.max_r) ? dim.max_r : legendNode_r;

        // DRAG BEHAVIOUR

        var drag = d3.behavior.drag()
            .on("dragstart", function(d) {
                dim.dragOn = true; 
            })
            .on("drag", function(d,i) {

                // current site affected
                var cur_site = d3.select(this).attr("class").substring(6);

                // operations on drag
                _dragFunction(vizObj, cur_site, d);
            })
            .on("dragend", function(d) {
                dim.dragOn = false; 

                // order sites
                _reorderSitesData(vizObj);

                // get site positioning coordinates etc
                _getSitePositioning(vizObj);   

                console.log("vizObj");
                console.log(vizObj);

                // reposition sites on the screen
                _snapSites(vizObj, viewSVG);
            });

        // DIVS

        var viewDIV = d3.select(el)
            .append("div")
            .attr("class", "viewDIV")
            .style("position", "relative")
            .style("width", dim.viewDiameter + "px")
            .style("height", dim.viewDiameter + "px")
            .style("float", "left");

        var legendDIV = d3.select(el)
            .append("div")
            .attr("class", "legendDIV")
            .style("position", "relative")
            .style("width", dim.legendWidth + "px")
            .style("height", dim.legendHeight + "px")
            .style("float", "left");

        // SVGS

        var viewSVG = viewDIV.append("svg:svg")
            .attr("class", "viewSVG")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", dim.viewDiameter + "px")
            .attr("height", dim.viewDiameter + "px");

        var legendSVG = legendDIV.append("svg:svg")
            .attr("class", "legendSVG")
            .attr("x", dim.viewDiameter)
            .attr("y", 0)
            .attr("width", dim.legendWidth)
            .attr("height", dim.legendHeight);

        // PLOT ANATOMY IMAGE IN MAIN VIEW

        var defs = viewSVG.append("defs").attr("id", "imgdefs")

        var anatomyPattern = defs.append("pattern")
                                .attr("id", "anatomyPattern")
                                .attr("height", 1)
                                .attr("width", 1)

        anatomyPattern.append("image")
            .attr("class", "anatomyImage")
            .attr("x", 0)
            .attr("y", 0)
            .attr("height", dim.image_plot_width)
            .attr("width", dim.image_plot_width)
            .attr("xlink:href", function() {
                if (vizObj.userConfig.gender == "F") {
                    return dim.anatomy_female_image_ref;
                }
                return dim.anatomy_male_image_ref;
            });

        viewSVG.append("circle")
            .attr("class", "anatomyDiagram")
            .attr("r", dim.innerRadius)
            .attr("cy", dim.viewDiameter/2)
            .attr("cx", dim.viewDiameter/2)
            .attr("fill", "url(#anatomyPattern)")
            .attr("stroke", "#CBCBCB")
            .attr("stroke-width", "3px")
            .attr("stroke-opacity", 0.2);

        // ZOOM INTO SELECT REGION ON ANATOMICAL IMAGE

        // get scaling information
        vizObj.crop_info = _scale(vizObj);

        // update the anatomy image with the new cropping
        d3.select(".anatomyImage") 
            .attr("height", vizObj.crop_info.new_width)
            .attr("width", vizObj.crop_info.new_width)
            .attr("x", -vizObj.crop_info.left_shift)
            .attr("y", -vizObj.crop_info.up_shift);          

        // SITE SVG GROUPS

        var siteGs = viewSVG.append("g")
            .attr("class", "siteGs")
            .selectAll(".siteG")
            .data(vizObj.data.sites)
            .enter().append("g")
            .attr("class", function(d) { return "siteG " + d.id.replace(/ /g,"_")})
            .call(drag);

        // PLOT CIRCLE BORDER

        viewSVG.append("circle")
            .attr("cx", dim.viewDiameter/2)
            .attr("cy", dim.viewDiameter/2)
            .attr("r", dim.viewDiameter/2 - 4)
            .attr("fill", "none")
            .attr("stroke", "#F4F3F3")
            .attr("stroke-width", "5px");

        // PLOT LEGEND GENOTYPE TREE

        // tree title
        legendSVG.append("text")
            .attr("class", "legendTitle")
            .attr("x", dim.legendTreeWidth/2) 
            .attr("y", 22)
            .attr("fill", '#616161')
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .attr("font-size", dim.legendTitleHeight)
            .text("Phylogeny");

        // d3 tree layout
        var treeLayout = d3.layout.tree()           
                .size([dim.legendTreeWidth - dim.legendNode_r*2, 
                    dim.legendTreeWidth - dim.legendNode_r*2]);

        // get nodes and links
        var root = $.extend({}, vizObj.data.treeStructure), // copy tree into new variable
            nodes = treeLayout.nodes(root), 
            links = treeLayout.links(nodes);   

        // swap x and y direction
        nodes.forEach(function(node) {
            node.tmp = node.y;
            node.y = node.x + dim.legendNode_r + dim.legendTitleHeight; 
            node.x = node.tmp + dim.legendNode_r; 
            delete node.tmp; 
        });

        // create links
        var link_ids = [];
        legendSVG.append("g")
            .attr("class","gtypeTreeLinkG")
            .selectAll(".legendTreeLink")                  
            .data(links)                   
            .enter().append("path")                   
            .attr("class", function(d) { 
                d.link_id = "legendTreeLink_" + d.source.id + "_" + d.target.id;
                link_ids.push(d.link_id);
                return "legendTreeLink " + d.link_id;
            })
            .attr('stroke', '#9E9A9A')
            .attr('fill', 'none')
            .attr('stroke-width', '2px')               
            .attr("d", function(d) {
                if (vizObj.data.direct_descendants[d.source.id][0] == d.target.id) {
                    return _elbow(d);
                }
                return _shortElbow(d);
            })
            .on("mouseover", function(d) {

                // shade other legend tree nodes & links
                d3.selectAll(".legendTreeNode").attr("fill-opacity", 0.15).attr("stroke-opacity", 0.15);
                d3.selectAll(".legendTreeLink").attr("stroke-opacity", 0.15);

                // shade view
                _shadeView();

                // highlight all elements downstream of link
                _downstreamEffects(vizObj, d.link_id, link_ids);
            })
            .on("mouseout", function() {
                _resetView(vizObj);
            });
        
        // create nodes
        var cols = vizObj.view.colour_assignment;
        legendSVG.append("g")
            .attr("class", "gtypeTreeNodeG")
            .selectAll(".legendTreeNode")                  
            .data(nodes)                   
            .enter()
            .append("circle")     
            .attr("class", function(d) {
                return "legendTreeNode " + d.id;
            })
            .attr("cx", function(d) { return d.x; })
            .attr("cy", function(d) { return d.y; })              
            .attr("fill", function(d) { return cols[d.id]; })
            .attr("stroke", function(d) { return cols[d.id]; })
            .attr("r", dim.legendNode_r)
            .on("mouseover", function(d) {

                // shade legend tree nodes & links
                d3.selectAll(".legendTreeNode").attr("fill-opacity", 0.15).attr("stroke-opacity", 0.15);
                d3.selectAll(".legendTreeLink").attr("stroke-opacity", 0.15);

                // shade view
                _shadeView();

                // highlight genotype in legend tree, & sites expressing this genotype
                _legendGtypeHighlight(vizObj, d.id);
            })
            .on("mouseout", function(d) {
                _resetView(vizObj);
            });

        // PLOT ANATOMY IN LEGEND

        // anatomy title
        legendSVG.append("text")
            .attr("class", "legendTitle")
            .attr("x", dim.legendTreeWidth/2) 
            .attr("y", dim.legend_image_top_l.y - dim.legendTitleHeight)
            .attr("fill", '#616161')
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .attr("font-size", dim.legendTitleHeight)
            .text("Anatomy");

        // anatomy image
        legendSVG.append("image")
            .attr("xlink:href", function() {
                if (vizObj.userConfig.gender == "F") {
                    return dim.anatomy_female_image_ref;
                }
                return dim.anatomy_male_image_ref;
            })
            .attr("x", dim.legend_image_top_l.x)
            .attr("y", dim.legend_image_top_l.y)
            .attr("width", dim.legend_image_plot_width)
            .attr("height", dim.legend_image_plot_width);

        // anatomy region of interest
        legendSVG.append("circle")
            .attr("cx", dim.legend_image_top_l.x + vizObj.crop_info.centre_prop.x*dim.legend_image_plot_width)
            .attr("cy", dim.legend_image_top_l.y + vizObj.crop_info.centre_prop.y*dim.legend_image_plot_width)
            .attr("r", (vizObj.crop_info.crop_width_prop/2)*dim.legend_image_plot_width)
            .attr("stroke", "#9E9A9A")
            .attr("fill", "none");

        // PLOT ANATOMIC MARKS FOR EACH SITE STEM (e.g. "Om", "ROv")

        viewSVG.append("g")
            .attr("class", "anatomicGeneralMarksG")
            .selectAll(".anatomicGeneralMark")
            .data(Object.keys(vizObj.data.siteStemsInDataset))
            .enter()
            .append("circle")
            .attr("class", function(d) {
                return d + " anatomicGeneralMark";
            })
            .attr("cx", function(d) { 
                var cropped_x = _getCroppedCoordinate(vizObj.crop_info, 
                                            vizObj.data.siteStemsInDataset[d].x, 
                                            vizObj.data.siteStemsInDataset[d].y,
                                            dim.image_top_l.x,
                                            dim.image_top_l.y,
                                            dim.image_plot_width
                                        ).x;
                return cropped_x;
            })
            .attr("cy", function(d) { 
                var cropped_y = _getCroppedCoordinate(vizObj.crop_info, 
                                            vizObj.data.siteStemsInDataset[d].x, 
                                            vizObj.data.siteStemsInDataset[d].y,
                                            dim.image_top_l.x,
                                            dim.image_top_l.y,
                                            dim.image_plot_width
                                        ).y;
                return cropped_y;
            })
            .attr("r", dim.siteMark_r)
            .attr("fill", "#747272")
            .attr("fill-opacity", 0)
            .on("mouseover", function(d) {
                // highlight this stem location
                d3.select(this)
                    .attr("fill-opacity", 1);

                // shade view
                _shadeView();

                // highlight all sites with this stem
                _highlightSites(vizObj.data.siteStemsInDataset[d].site_ids);

            })
            .on("mouseout", function(d) {
                _resetView(vizObj);
            });

        // PLOT MIXTURE CLASSIFICATION

        // var mixture_classes = _.uniq(_.pluck(vizObj.data.sites, "phyly")); 
        var mixture_classes = {};
        vizObj.data.sites.forEach(function(site) {
            mixture_classes[site.phyly] = mixture_classes[site.phyly] || [];
            mixture_classes[site.phyly].push({"site_id": site.id, 
                                                "site_stem": site.stem.siteStem});
        })

        console.log("mixture_classes");
        console.log(mixture_classes);
        // plot mixture classification title
        legendSVG.append("text")
            .attr("class", "legendTitle")
            .attr("x", dim.legendTreeWidth/2) 
            .attr("y", dim.legend_mixture_top)
            .attr("dy", "+0.71em")
            .attr("fill", '#616161')
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .attr("font-size", dim.legendTitleHeight)
            .text("Mixture");
        legendSVG.append("text")
            .attr("class", "legendTitle")
            .attr("x", dim.legendTreeWidth/2) 
            .attr("y", dim.legend_mixture_top + dim.legendTitleHeight)
            .attr("dy", "+0.71em")
            .attr("fill", '#616161')
            .attr("text-anchor", "middle")
            .attr("font-family", "sans-serif")
            .attr("font-size", dim.legendTitleHeight)
            .text("Classification");

        var spacing_below_title = 5;
        Object.keys(mixture_classes).forEach(function(phyly, phyly_idx) {
            legendSVG.append("text")
                .attr("class", "mixtureClass")
                .attr("x", 0) 
                .attr("y", dim.legend_mixture_top + dim.legendTitleHeight*2 + spacing_below_title + phyly_idx*(dim.mixtureClassFontSize + 2))
                .attr("dy", "+0.71em")
                .attr("fill", '#9E9A9A')
                .attr("font-family", "sans-serif")
                .attr("font-size", dim.mixtureClassFontSize)
                .text(function() { return " - " + phyly; })
                .on("mouseover", function() {

                    // shade view
                    _shadeView();

                    // highlight sites
                    _highlightSites(_.pluck(mixture_classes[phyly], "site_id"));

                    var stems = _.uniq(_.pluck(mixture_classes[phyly], "site_stem"));
                    console.log("stems");
                    console.log(stems);
                    stems.forEach(function(stem) {
                        d3.select(".anatomicGeneralMark."+stem)
                            .attr("fill-opacity",1);
                    })
                })
                .on("mouseout", function(d) {
                    _resetView(vizObj);
                });
        });

        // JITTER

        // get a single jitter value for each genotype
        vizObj.view.jitter = {};
        vizObj.data.treeNodes.forEach(function(gtype) {
            vizObj.view.jitter[gtype] = {x: _getRandom(-dim.siteMark_r/4, dim.siteMark_r/4),
                            y: _getRandom(-dim.siteMark_r/4, dim.siteMark_r/4)};
        })

        // FOR EACH SITE
        vizObj.site_ids.forEach(function(site, site_idx) {

            // PLOT SITE-SPECIFIC ELEMENTS (oncoMix, tree, title, anatomic lines, anatomic marks)
            _plotSite(vizObj, site, viewSVG);            
        });
    },

    resize: function(el, width, height, instance) {

    }

});
